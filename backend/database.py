import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session

# Чтение URL подключения из переменной окружения (по умолчанию локальный контур PostgreSQL 15)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://smartuser:smartpassword@db:5432/smartspace"
)

# Создание движка SQLAlchemy 2.0 с проверкой активности соединения (pool_pre_ping)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    echo=False
)

# Фабрика сессий
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# Базовый класс для декларативных моделей SQLAlchemy 2.0
class Base(DeclarativeBase):
    pass


# Зависимость (Dependency) для получения сессии БД в маршрутизаторах FastAPI
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()