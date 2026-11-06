import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
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
    hours: int = Field(default=1, ge=1, le=12, description="Количество бронируемых часовых слотов подряд")
    user_id: str = Field(..., min_length=1, max_length=64, description="Внешний идентификатор арендатора")


class BookingConfirmRequest(BaseModel):
    """Схема запроса на подтверждение массива часовых слотов и генерацию единого QR-кода."""

    booking_ids: List[int] = Field(..., min_length=1, description="Список ID часовых слотов для подтверждения")


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
    """Детализация отдельного свободного 1-часового слота с ценой."""

    start_time: datetime.time
    end_time: datetime.time
    price: Decimal = Field(..., description="Стоимость 1-часового слота в BYN")


class AvailableRoomItem(BaseModel):
    """Схема информации о доступном помещении со списком слотов и расценками."""

    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    price: Decimal = Field(..., description="Базовая стоимость 1 часа аренды помещения в BYN")
    available_slots: List[AvailableSlotInfo]