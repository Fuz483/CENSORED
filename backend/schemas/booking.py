import datetime
from decimal import Decimal
from enum import Enum
from typing import Annotated, List, Optional
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


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


class BookingInterval(BaseModel):
    date: datetime.date = Field(..., description="Дата бронирования (YYYY-MM-DD)")
    start_time: datetime.time = Field(..., description="Время начала первого слота (HH:MM:SS)")
    hours: float = Field(default=1, ge=1, le=7, description="Продолжительность бронирования; шаг 15 минут")

    @model_validator(mode="after")
    def validate_interval(self):
        minutes = round(self.hours * 60)
        start = self.start_time.hour * 60 + self.start_time.minute
        if self.start_time.tzinfo or self.start_time.second or self.start_time.microsecond or start % 15:
            raise ValueError("Время начала должно быть кратно 15 минутам.")
        if abs(self.hours * 60 - minutes) > 1e-6 or minutes % 15:
            raise ValueError("Продолжительность должна быть кратна 15 минутам.")
        if start < 14 * 60 or start + minutes > 21 * 60:
            raise ValueError("Бронирование должно находиться в интервале 14:00–21:00.")
        return self


class BookingDetails(BookingInterval):
    school: str = Field(..., min_length=2, max_length=255)
    type_room: RoomType
    room: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=64)


class BookingCreate(BookingDetails):
    agreement_accepted: bool = Field(default=False, strict=True)
    agreement_token: str = Field(default="", pattern=r"^(?:[0-9a-f]{64})?$")


class RentalAgreement(BaseModel):
    version: str
    text: str
    token: str


class WeeklyReservationCreate(BookingInterval):
    listing_id: int = Field(gt=0)
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class BookingStateUpdate(BaseModel):
    """Схема запроса на модификацию статуса слота бронирования."""

    state: BookingState = Field(..., description="Новый целевой статус бронирования")


class BookingResponse(BaseModel):
    """Схема ответа с данными о почасовом слоте бронирования."""

    id: int
    listing_id: int
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


class TenantBookingResponse(BookingResponse):
    agreement_version: str | None = None
    agreement_text: str | None = None
    agreement_accepted_at: datetime.datetime | None = None


class WeeklyReservationResponse(BookingResponse):
    series_label: str


class AvailableSlotInfo(BaseModel):
    """Детализация свободного 15-минутного интервала с его стоимостью."""

    start_time: datetime.time
    end_time: datetime.time
    price: Decimal = Field(..., description="Стоимость 15-минутного интервала в BYN")


class AvailableRoomItem(BaseModel):
    """Схема информации о доступном помещении со списком слотов и расценками."""

    id: int
    school: str
    type_room: RoomType
    room: str
    date: datetime.date
    price: Decimal = Field(..., description="Базовая стоимость 1 часа аренды помещения в BYN")
    capacity: Optional[int] = None
    address: Optional[str] = None
    city: str | None = None
    city_district: str | None = None
    uo: Optional[str] = None
    owner_id: Optional[str] = None
    available_from: datetime.time = datetime.time(14, 0)
    available_to: datetime.time = datetime.time(21, 0)
    image_url: str = "/room-placeholder.svg"
    available_slots: List[AvailableSlotInfo]
