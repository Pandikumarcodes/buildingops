from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    database_url: str | None = None
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_keepalive_seconds: int = Field(default=60, gt=0)
    mqtt_qos: int = Field(default=1, ge=1, le=1)
    mqtt_username: str | None = None
    mqtt_password: str | None = None
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_timeout_seconds: int = Field(default=15, gt=0, le=60)
    ai_max_tool_rounds: int = Field(default=3, ge=1, le=5)

    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
