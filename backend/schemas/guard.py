import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from schemas.booking import BookingState


class QRScanRequest(BaseModel):
    """Схема входящего запроса от терминала поста охраны при сканировании QR-пропуска."""

    code: str = Field(..., min_length=4, max_length=64, description="Уникальный код QR-пропуска")


class QRVisitor(BaseModel):
    name: str = ""
    phone: str = ""


class QRScanSlot(BaseModel):
    date: datetime.date
    start_time: datetime.time
    end_time: datetime.time
    state: BookingState


class QRScanResponse(BaseModel):
    """Схема ответа для поста охраны с агрегированными данными сессии и статусом допуска."""

    access_granted: bool = Field(..., description="Флаг разрешения допуска на объект")
    reason: str = Field(..., description="Обоснование решения системы контроля доступа")
    code: str
    school: str
    room: str
    date: datetime.date
    session_start: datetime.time
    session_end: datetime.time
    slots_count: int
    total_price: Decimal = Field(..., description="Суммарная стоимость всех слотов сессии в BYN")
    user: QRVisitor
    slots: list[QRScanSlot]
