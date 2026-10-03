"""HTTP endpoint for one bounded assistant question per request."""

import logging

from fastapi import APIRouter, HTTPException, status
from google.genai.errors import APIError

from app.ai.exceptions import OperationalDataUnavailableError, ToolExecutionError
from app.ai.gemini import answer_with_gemini
from app.ai.schemas import ChatRequest, ChatResponse
from app.core.config import get_settings
from app.db import get_session_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    settings = get_settings()
    if settings.gemini_api_key is None or not settings.gemini_api_key.get_secret_value().strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is temporarily unavailable. Please try again.",
        )
    try:
        return answer_with_gemini(request.message, settings, get_session_factory())
    except OperationalDataUnavailableError:
        logger.warning("AI assistant operational-data request failed")
        return ChatResponse(
            answer="BuildingOps operational data is temporarily unavailable.",
            model=settings.gemini_model,
            grounded=False,
            sources=[],
        )
    except ToolExecutionError:
        logger.warning("AI assistant tool request failed")
        return ChatResponse(
            answer="I couldn't retrieve the requested building data.",
            model=settings.gemini_model,
            grounded=False,
            sources=[],
        )
    except (TimeoutError, ConnectionError, OSError) as exc:
        logger.warning("Gemini provider request failed (%s)", type(exc).__name__)
        return _provider_fallback(settings.gemini_model)
    except APIError as exc:
        if exc.code == 429 or exc.code >= 500:
            logger.warning("Gemini provider request failed (status=%s)", exc.code)
            return _provider_fallback(settings.gemini_model)
        logger.exception("Unexpected Gemini API request failure")
        return _internal_fallback(settings.gemini_model)
    except Exception as exc:
        logger.exception("Unexpected AI assistant request failure (%s)", type(exc).__name__)
        return _internal_fallback(settings.gemini_model)


def _provider_fallback(model: str) -> ChatResponse:
    return ChatResponse(
        answer="AI service is temporarily unavailable. Please try again.",
        model=model,
        grounded=False,
        sources=[],
    )


def _internal_fallback(model: str) -> ChatResponse:
    return ChatResponse(
        answer="The AI assistant couldn't complete the request.",
        model=model,
        grounded=False,
        sources=[],
    )
