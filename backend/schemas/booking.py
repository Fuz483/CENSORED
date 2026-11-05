import datetime
from enum import Enum
from typing import List
from pydantic import BaseModel, ConfigDict, Field


class RoomType(str, Enum):
    """Допустимые типы арендуемых помещений."""

    sport_hall = "sport_hall"
    assembly_hall = "assembly_hall"
    it_lab = "it_lab"
    workshop = "workshop"


class BookingState(str, Enum):
    """Жизненный цикл статусов бронирования."""

    pending = "pending"
    confirmed = "confirmed"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class BookingCreate(BaseModel):
    """Схема запроса на создание нового бронирования."""

    school: str = Field(..., min_length=2, max_length=255, description="Наименование учебного заведения")
    type_room: RoomType = Field(..., description="Категория помещения")
    room: str = Field(..., min_length=1, max_length=128, description="Номер или идентификатор кабинета/зала")
    date: datetime.date = Field(..., description="Дата бронирования (YYYY-MM-DD)")
    start_time: datetime.time = Field(..., description="Время начала аренды (HH:MM:SS)")
    user_id: str = Field(..., min_length=1, max_length=64, description="Внешний идентификатор арендатора")


class BookingStateUpdate(BaseModel):
    """Схема запроса на модификацию статуса бронирования."""

    state: BookingState = Field(..., description="Новый целевой статус бронирования")


class BookingResponse(BaseModel):
    """Схема ответа с данными о бронировании."""

    id: int
    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    start_time: datetime.time
    state: BookingState
    user_id: str

    model_config = ConfigDict(from_attributes=True)


class AvailableRoomItem(BaseModel):
    """Схема информации о доступном помещении и свободных временных слотах."""

    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    available_slots: List[datetime.time]