from datetime import date as dt_date, time as dt_time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Допустимые значения ролей и зон допуска (Safety Tiers)
Role = Literal["tenant", "teacher", "master", "admin"]
SafetyTier = Literal["green", "yellow", "red"]
BookingState = Literal["pending", "approved", "booked", "rejected"]


# ==========================================
# Схемы для таблицы пользователей (user_table)
# ==========================================

class UserBase(BaseModel):
    user_id: str = Field(..., description="Уникальный строковый идентификатор пользователя", examples=["USR-001"])
    name: str = Field(..., description="ФИО пользователя или наименование арендатора", examples=["Иванов Иван Иванович"])
    phone: str = Field(..., description="Контактный номер телефона", examples=["+375291234567"])
    role: Role = Field(..., description="Роль в системе (tenant, teacher, master, admin)", examples=["tenant"])
    rating: float = Field(default=5.0, ge=0.0, le=5.0, description="Рейтинг благонадежности пользователя")


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Схемы для таблицы бронирований (booking_table)
# ==========================================

class BookingBase(BaseModel):
    school: str = Field(..., description="Наименование учреждения образования / школы", examples=["СШ №1 г. Минска"])
    type_room: SafetyTier = Field(..., description="Тип помещения / зона допуска (green, yellow, red)", examples=["green"])
    room: str = Field(..., description="Номер или название кабинета/объекта", examples=["Спортзал №1"])
    date: dt_date = Field(..., description="Дата бронирования (YYYY-MM-DD)", examples=["2026-11-10"])
    start_time: dt_time = Field(..., description="Время начала слота (HH:MM:SS)", examples=["18:00:00"])
    user_id: str = Field(..., description="Внешний ключ user_table.user_id", examples=["USR-001"])


class BookingCreate(BookingBase):
    # Статус заявки всегда устанавливается сервером (pending), а не клиентом
    pass


class BookingRead(BookingBase):
    id: int
    state: BookingState

    model_config = ConfigDict(from_attributes=True)
