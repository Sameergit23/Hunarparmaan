"""Settings, from environment variables (and services/ai/.env when present)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVICE_DIR / ".env", extra="ignore")

    #: Where `hp-ai fetch-models` puts the models. Never committed.
    ai_models_dir: Path = Field(default=SERVICE_DIR / ".models")
    #: When set, every request except /healthz needs `Authorization: Bearer <token>`.
    ai_service_token: str | None = None
    #: Largest clip accepted by /vision/analyze.
    ai_max_upload_mb: int = 200

    #: Any OpenAI-compatible chat endpoint, preferably hosted in India. Only
    #: transcripts are sent to it (rule 8). Without it, /extract returns no claims.
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_s: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
