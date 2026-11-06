from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Конфигурация приложения и подключения к базе данных."""

    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "smartspace"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    BACKEND_PORT: int = 8000
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    JWT_SECRET_KEY: str = "dev-only-change-this-secret-before-deployment"
    JWT_ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7
    UO_DEMO_ENABLED: bool = False

    @property
    def async_database_url(self) -> str:
        """Формирование строки асинхронного подключения к PostgreSQL."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
