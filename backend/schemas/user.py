from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class UserRole(str, Enum):
    """Допустимые роли пользователей в системе."""

    tenant = "tenant"
    master = "master"
    admin = "admin"
    inspector = "inspector"
    guard = "guard"


class UserCreate(BaseModel):
    """Схема входящего запроса на регистрацию пользователя."""

    user_id: str = Field(..., min_length=1, max_length=64, description="Уникальный внешний идентификатор")
    name: str = Field(..., min_length=2, max_length=255, description="ФИО или наименование организации")
    phone: str = Field(..., min_length=7, max_length=32, description="Контактный номер телефона")
    passport_id: Optional[str] = Field(default=None, max_length=64, description="Серия и номер паспорта или УНП")
    role: UserRole = Field(default=UserRole.tenant, description="Роль пользователя")
    rating: float = Field(default=5.0, ge=0.0, le=5.0, description="Рейтинг пользователя")


class UserResponse(BaseModel):
    """Схема ответа с данными профиля пользователя."""

    id: int
    user_id: str
    name: str
    phone: str
    passport_id: Optional[str] = None
    role: UserRole
    rating: float

    model_config = ConfigDict(from_attributes=True)
