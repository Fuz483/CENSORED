import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoomType(str, Enum):
    """Допустимые типы арендуемых помещений."""

    sport_hall = "sport_hall"
    assembly_hall = "assembly_hall"
    it_lab = "it_lab"
    workshop = "workshop"
    pool = "pool"


class BookingState(str, Enum):
    """Жизненный цикл статусов бронирования."""

    pending = "pending"
    confirmed = "confirmed"
    paid = "paid"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class BookingCreate(BaseModel):
    """Схема запроса на создание серии почасовых слотов бронирования."""

    school: str = Field(..., min_length=2, max_length=255, description="Наименование учебного заведения")
    type_room: RoomType = Field(..., description="Категория помещения")
    room: str = Field(..., min_length=1, max_length=128, description="Номер или идентификатор помещения")
    date: datetime.date = Field(..., description="Дата бронирования (YYYY-MM-DD)")
    start_time: datetime.time = Field(..., description="Время начала первого слота (HH:MM:SS)")
    hours: float = Field(default=1, ge=1, le=7, description="Продолжительность бронирования; шаг 15 минут")
    user_id: str = Field(..., min_length=1, max_length=64, description="Внешний идентификатор арендатора")

    @model_validator(mode="after")
    def validate_interval(self):
        minutes = round(self.hours * 60)
        start = self.start_time.hour * 60 + self.start_time.minute
        if self.start_time.second or self.start_time.microsecond or start % 15:
            raise ValueError("Время начала должно быть кратно 15 минутам.")
        if abs(self.hours * 60 - minutes) > 1e-6 or minutes % 15:
            raise ValueError("Продолжительность должна быть кратна 15 минутам.")
        if start < 14 * 60 or start + minutes > 21 * 60:
            raise ValueError("Бронирование должно находиться в интервале 14:00–21:00.")
        return self


class BookingStateUpdate(BaseModel):
    """Схема запроса на модификацию статуса слота бронирования."""

    state: BookingState = Field(..., description="Новый целевой статус бронирования")


class BookingResponse(BaseModel):
    """Схема ответа с данными о почасовом слоте бронирования."""

    id: int
    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time
    price: Decimal
    state: BookingState
    code: Optional[str] = None
    user_id: str

    model_config = ConfigDict(from_attributes=True)


class AvailableSlotInfo(BaseModel):
    """Детализация свободного 15-минутного интервала с его стоимостью."""

    start_time: datetime.time
    end_time: datetime.time
    price: Decimal = Field(..., description="Стоимость 15-минутного интервала в BYN")


class AvailableRoomItem(BaseModel):
    """Схема информации о доступном помещении со списком слотов и расценками."""

    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    price: Decimal = Field(..., description="Базовая стоимость 1 часа аренды помещения в BYN")
    capacity: Optional[int] = None
    address: Optional[str] = None
    uo: Optional[str] = None
    owner_id: Optional[str] = None
    available_from: datetime.time = datetime.time(14, 0)
    available_to: datetime.time = datetime.time(21, 0)
    image_url: str = "/room-placeholder.svg"
    available_slots: List[AvailableSlotInfo]
