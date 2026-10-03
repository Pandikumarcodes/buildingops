from pathlib import Path

from app.core.config import ROOT_ENV_FILE, Settings


def test_settings_root_env_path_is_absolute_and_cwd_independent(
    monkeypatch, tmp_path: Path
) -> None:
    """The backend may start from either repository root or backend/."""
    monkeypatch.chdir(tmp_path)

    assert ROOT_ENV_FILE.is_absolute()
    assert ROOT_ENV_FILE == Path(__file__).resolve().parents[2] / ".env"
    assert Settings.model_config["env_file"] == ROOT_ENV_FILE
