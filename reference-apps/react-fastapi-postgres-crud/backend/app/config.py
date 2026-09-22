from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env is optional: docker-compose/local dev may provide one, but CI injects env
# vars directly and has no .env file on disk (the same trap PP-003 hit with
# `--env-file=.env` hard-failing in CI — pydantic-settings' env_file lookup is
# silently a no-op when the file is missing, so there is nothing to fix here).
_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE if _ENV_FILE.exists() else None, extra="ignore")

    database_url: str
    session_secret: str
    environment: str = "development"

    def require_session_secret(self) -> str:
        if len(self.session_secret) < 16:
            raise RuntimeError(
                "SESSION_SECRET is missing or too short — set a real 32+ byte secret (see .env.example)"
            )
        return self.session_secret


# pydantic-settings populates required fields from the environment at runtime; mypy has no
# way to see that, so this is the standard, documented pydantic-settings + mypy workaround.
settings = Settings()  # type: ignore[call-arg]
