from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.genai.errors import APIError
from sqlalchemy.orm import Session, sessionmaker

from app.ai.exceptions import OperationalDataUnavailableError, ToolExecutionError
from app.ai.gemini import GeminiAssistant
from app.ai.schemas import ChatResponse
from app.ai.tools import (
    MAX_HISTORY_ROWS,
    execute_tool,
    get_active_alerts,
    get_current_building_state,
    get_zone_history,
)
from app.core.config import Settings
from app.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    AlertType,
    Building,
    Floor,
    Telemetry,
    Zone,
)


def create_zone(session: Session, code: str = "OPEN-OFFICE") -> Zone:
    zone = Zone(
        floor=Floor(
            building=Building(name="Demo Building", code="DEMO"),
            name="Ground Floor",
            floor_number=1,
        ),
        name=code.replace("-", " ").title(),
        code=code,
    )
    session.add(zone)
    session.commit()
    return zone


def create_reading(session: Session, zone: Zone, at: datetime) -> None:
    session.add(
        Telemetry(
            zone_id=zone.id,
            temperature=24.5,
            humidity=50,
            co2_ppm=700,
            occupancy=4,
            hvac_status="ON",
            hvac_setpoint=23,
            hvac_power_kw=1.2,
            zone_power_kw=2,
            recorded_at=at,
        )
    )
    session.commit()


def test_read_tools_return_bounded_simulated_data_and_missing_states(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        create_reading(session, zone, datetime.now(UTC) - timedelta(minutes=2))
        session.add(
            Alert(
                zone_id=zone.id,
                alert_type=AlertType.HIGH_CO2,
                severity=AlertSeverity.WARNING,
                status=AlertStatus.ACTIVE,
                message="High CO2 in Open Office",
                trigger_value=1300,
                triggered_at=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        session.commit()

    state = get_current_building_state(db_session_factory)
    assert state["data_kind"] == "simulated telemetry"
    assert state["zones"][0]["floor"] == "Ground Floor"
    assert state["zones"][0]["co2_ppm"] == 700
    assert (
        execute_tool("get_active_alerts", {}, db_session_factory)["alerts"][0]["zone"]
        == "Open Office"
    )
    assert (
        len(get_zone_history(db_session_factory, {"zone": "open-office", "hours": 24})["readings"])
        == 1
    )
    assert get_zone_history(db_session_factory, {"zone": "missing"})["error"] == "zone not found"
    assert get_zone_history(db_session_factory, {"zone": "Open Office", "hours": 169})["error"]
    assert execute_tool("drop_database", {}, db_session_factory) == {
        "error": "tool is not available"
    }


def test_active_alert_tool_excludes_resolved_alerts(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        session.add_all(
            [
                Alert(
                    zone_id=zone.id,
                    alert_type=AlertType.HIGH_CO2,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.ACTIVE,
                    message="Active CO2 alert",
                    trigger_value=1300,
                    triggered_at=datetime.now(UTC),
                ),
                Alert(
                    zone_id=zone.id,
                    alert_type=AlertType.HIGH_TEMPERATURE,
                    severity=AlertSeverity.WARNING,
                    status=AlertStatus.RESOLVED,
                    message="Resolved temperature alert",
                    trigger_value=29,
                    triggered_at=datetime.now(UTC) - timedelta(hours=2),
                    resolved_at=datetime.now(UTC) - timedelta(hours=1),
                ),
            ]
        )
        session.commit()

    result = get_active_alerts(db_session_factory)
    assert result["data_kind"] == "active alerts from simulated telemetry"
    assert [alert["message"] for alert in result["alerts"]] == ["Active CO2 alert"]
    assert result["alerts"][0]["floor"] == "Ground Floor"


def test_zone_history_resolves_zone_and_caps_results(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session, "SERVER-ROOM")
        now = datetime.now(UTC)
        for offset in range(MAX_HISTORY_ROWS + 7):
            create_reading(session, zone, now - timedelta(minutes=offset))

    result = get_zone_history(db_session_factory, {"zone": "Server Room", "hours": 24})
    assert result["zone_code"] == "SERVER-ROOM"
    assert result["floor"] == "Ground Floor"
    assert result["max_records"] == MAX_HISTORY_ROWS
    assert len(result["readings"]) == MAX_HISTORY_ROWS
    assert result["readings"][0]["hvac_setpoint_c"] == 23


def test_current_state_marks_zone_without_persisted_data(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        create_zone(session)
    assert (
        get_current_building_state(db_session_factory)["zones"][0]["data"]
        == "no persisted readings"
    )
    assert get_zone_history(db_session_factory, {"zone": "Open Office"})["readings"] == []


class FakeModels:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def generate_content(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.responses.pop(0)


def fake_response(calls: list[Any], text: str = "") -> Any:
    return SimpleNamespace(
        function_calls=calls,
        text=text,
        candidates=[SimpleNamespace(content=SimpleNamespace(role="model", parts=[]))],
    )


def test_gemini_executes_only_declared_tool_and_sends_result_back(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        zone = create_zone(session)
        create_reading(session, zone, datetime.now(UTC))
    fake_models = FakeModels(
        [
            fake_response([SimpleNamespace(name="get_current_building_state", args={})]),
            fake_response([], "Open Office is 24.5 C."),
        ]
    )
    response = GeminiAssistant(
        Settings(gemini_api_key="test-only-key", ai_max_tool_rounds=2),
        db_session_factory,
        SimpleNamespace(models=fake_models),
    ).answer("Current state?")

    assert response.answer == "Open Office is 24.5 C."
    assert response.grounded is True
    assert response.sources == ["get_current_building_state"]
    assert len(fake_models.calls) == 2
    config = fake_models.calls[0]["config"]
    assert "read-only" in str(config.system_instruction)
    assert config.automatic_function_calling.disable is True
    assert {declaration.name for declaration in config.tools[0].function_declarations} == {
        "get_current_building_state",
        "get_active_alerts",
        "get_zone_history",
    }
    model_content = fake_models.calls[1]["contents"][-2]
    function_response_content = fake_models.calls[1]["contents"][-1]
    assert model_content.role == "model"
    assert function_response_content.role == "user"
    function_response = function_response_content.parts[0].function_response
    assert function_response.name == "get_current_building_state"
    assert set(function_response.response) == {"result"}
    assert function_response.response["result"]["data_kind"] == "simulated telemetry"


def test_gemini_caps_tool_call_rounds(db_session_factory: sessionmaker[Session]) -> None:
    call = fake_response([SimpleNamespace(name="get_current_building_state", args={})])
    fake_models = FakeModels([call, call, call])
    response = GeminiAssistant(
        Settings(gemini_api_key="test-only-key", ai_max_tool_rounds=2),
        db_session_factory,
        SimpleNamespace(models=fake_models),
    ).answer("Check the building")
    assert len(fake_models.calls) == 3
    assert "tool-call limit" in response.answer
    assert response.grounded is True


def test_gemini_only_marks_valid_operational_tool_results_as_grounded(
    db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    fake_models = FakeModels(
        [
            fake_response([SimpleNamespace(name="get_zone_history", args={"zone": "missing"})]),
            fake_response([], "No matching zone was found."),
        ]
    )
    with pytest.raises(ToolExecutionError):
        GeminiAssistant(
            Settings(gemini_api_key="test-only-key"),
            db_session_factory,
            SimpleNamespace(models=fake_models),
        ).answer("Show missing-zone history")

    monkeypatch.setattr(
        "app.ai.gemini.execute_tool",
        lambda *_args: {"error": "operational data unavailable"},
    )
    unavailable_models = FakeModels(
        [
            fake_response([SimpleNamespace(name="get_active_alerts", args={})]),
            fake_response([], "The operational data is unavailable."),
        ]
    )
    with pytest.raises(OperationalDataUnavailableError):
        GeminiAssistant(
            Settings(gemini_api_key="test-only-key"),
            db_session_factory,
            SimpleNamespace(models=unavailable_models),
        ).answer("Which alerts are active?")
    assert unavailable_models.calls[1]["contents"][-1].parts[0].function_response.response == {
        "result": {"error": "operational data unavailable"}
    }


@pytest.mark.parametrize(
    ("tool_name", "arguments"),
    [
        ("not_a_tool", {}),
        ("get_active_alerts", {"unexpected": "argument"}),
        ("get_zone_history", {"zone": "missing"}),
    ],
)
def test_failed_tools_never_become_grounding_sources(
    db_session_factory: sessionmaker[Session], tool_name: str, arguments: dict[str, Any]
) -> None:
    fake_models = FakeModels(
        [
            fake_response([SimpleNamespace(name=tool_name, args=arguments)]),
            fake_response([], "The requested data was unavailable."),
        ]
    )

    with pytest.raises(ToolExecutionError):
        GeminiAssistant(
            Settings(gemini_api_key="test-only-key"),
            db_session_factory,
            SimpleNamespace(models=fake_models),
        ).answer("Investigate this")


def test_empty_valid_tool_results_are_legitimate_grounding(
    db_session_factory: sessionmaker[Session],
) -> None:
    alerts_models = FakeModels(
        [
            fake_response([SimpleNamespace(name="get_active_alerts", args={})]),
            fake_response([], "There are no active alerts."),
        ]
    )
    alerts_response = GeminiAssistant(
        Settings(gemini_api_key="test-only-key"),
        db_session_factory,
        SimpleNamespace(models=alerts_models),
    ).answer("Which alerts are active?")
    assert alerts_response.grounded is True
    assert alerts_response.sources == ["get_active_alerts"]

    with db_session_factory() as session:
        create_zone(session, "SERVER-ROOM")
    history_models = FakeModels(
        [
            fake_response([SimpleNamespace(name="get_zone_history", args={"zone": "Server Room"})]),
            fake_response([], "There are no readings in the requested window."),
        ]
    )
    history_response = GeminiAssistant(
        Settings(gemini_api_key="test-only-key"),
        db_session_factory,
        SimpleNamespace(models=history_models),
    ).answer("Show Server Room history")
    assert history_response.grounded is True
    assert history_response.sources == ["get_zone_history"]


def test_tool_execution_exception_is_bounded(
    db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    monkeypatch.setattr(
        "app.ai.tools.get_active_alerts", lambda *_args: (_ for _ in ()).throw(RuntimeError())
    )
    assert execute_tool("get_active_alerts", {}, db_session_factory) == {
        "error": "tool execution failed"
    }


def test_chat_api_validates_request_and_returns_typed_response(
    client: TestClient, db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    monkeypatch.setattr("app.ai.api.get_settings", lambda: Settings(gemini_api_key="test-only-key"))
    monkeypatch.setattr("app.ai.api.get_session_factory", lambda: db_session_factory)
    monkeypatch.setattr(
        "app.ai.api.answer_with_gemini",
        lambda message, settings, factory: ChatResponse(
            answer=f"Received: {message}",
            model=settings.gemini_model,
            grounded=True,
            sources=["get_active_alerts"],
        ),
    )
    response = client.post("/ai/chat", json={"message": "Which alerts are active?"})
    assert response.status_code == 200
    assert response.json()["answer"] == "Received: Which alerts are active?"
    assert response.json()["grounded"] is True
    assert client.post("/ai/chat", json={"message": " "}).status_code == 422
    assert client.post("/ai/chat", json={"message": "valid", "history": []}).status_code == 422


def test_chat_api_explains_missing_key(client: TestClient, monkeypatch: Any) -> None:
    monkeypatch.setattr("app.ai.api.get_settings", lambda: Settings(gemini_api_key=None))
    response = client.post("/ai/chat", json={"message": "What is happening?"})
    assert response.status_code == 503
    assert response.json()["detail"] == "AI service is temporarily unavailable. Please try again."


def test_chat_api_returns_safe_provider_fallback(
    client: TestClient, db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    monkeypatch.setattr("app.ai.api.get_settings", lambda: Settings(gemini_api_key="test-only-key"))
    monkeypatch.setattr("app.ai.api.get_session_factory", lambda: db_session_factory)

    def timeout(*_args: Any, **_kwargs: Any) -> ChatResponse:
        raise TimeoutError("provider timeout; key=must-not-be-returned")

    monkeypatch.setattr("app.ai.api.answer_with_gemini", timeout)
    response = client.post("/ai/chat", json={"message": "Which alerts are active?"})
    assert response.status_code == 200
    assert response.json()["grounded"] is False
    assert response.json()["sources"] == []
    assert "must-not-be-returned" not in response.text


def test_chat_api_maps_provider_503_to_safe_provider_fallback(
    client: TestClient, db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    monkeypatch.setattr("app.ai.api.get_settings", lambda: Settings(gemini_api_key="test-only-key"))
    monkeypatch.setattr("app.ai.api.get_session_factory", lambda: db_session_factory)

    def provider_503(*_args: Any, **_kwargs: Any) -> ChatResponse:
        raise APIError(503, {"message": "provider secret must not escape"})

    monkeypatch.setattr("app.ai.api.answer_with_gemini", provider_503)
    response = client.post("/ai/chat", json={"message": "Which alerts are active?"})
    assert response.status_code == 200
    assert response.json() == {
        "answer": "AI service is temporarily unavailable. Please try again.",
        "model": "gemini-3.8-flash",
        "grounded": False,
        "sources": [],
    }
    assert "provider secret" not in response.text


def test_chat_api_classifies_operational_data_and_tool_failures(
    client: TestClient, db_session_factory: sessionmaker[Session], monkeypatch: Any
) -> None:
    monkeypatch.setattr("app.ai.api.get_settings", lambda: Settings(gemini_api_key="test-only-key"))
    monkeypatch.setattr("app.ai.api.get_session_factory", lambda: db_session_factory)

    monkeypatch.setattr(
        "app.ai.api.answer_with_gemini",
        lambda *_args: (_ for _ in ()).throw(OperationalDataUnavailableError()),
    )
    data_response = client.post("/ai/chat", json={"message": "What is happening?"})
    assert data_response.status_code == 200
    assert data_response.json() == {
        "answer": "BuildingOps operational data is temporarily unavailable.",
        "model": "gemini-3.8-flash",
        "grounded": False,
        "sources": [],
    }

    monkeypatch.setattr(
        "app.ai.api.answer_with_gemini",
        lambda *_args: (_ for _ in ()).throw(ToolExecutionError()),
    )
    tool_response = client.post("/ai/chat", json={"message": "What is happening?"})
    assert tool_response.status_code == 200
    assert tool_response.json()["answer"] == "I couldn't retrieve the requested building data."
    assert tool_response.json()["grounded"] is False
    assert tool_response.json()["sources"] == []
