from pathlib import Path
from typing import List
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    """Конфигурация приложения и подключения к базе данных."""

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "smartspace"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    BACKEND_PORT: int = 8000
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    JWT_SECRET_KEY: str
    JWT_ACCESS_TOKEN_MINUTES: int = Field(default=60 * 8, gt=0, le=60 * 24 * 7)
    UO_DEMO_ENABLED: bool = False
    FRONTEND_DIST: Path | None = None

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value.strip().encode()) < 32 or value.strip() in {
            "dev-only-change-this-secret-before-deployment", "replace-with-a-long-random-secret",
        }:
            raise ValueError("Configure a randomly generated JWT_SECRET_KEY of at least 32 bytes.")
        return value

    @property
    def async_database_url(self) -> URL:
        """URL асинхронного подключения к PostgreSQL."""
        return URL.create(
            "postgresql+asyncpg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_HOST,
            port=self.POSTGRES_PORT,
            database=self.POSTGRES_DB,
        )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )


settings = Settings()
