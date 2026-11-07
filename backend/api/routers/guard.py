from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from api.routers.bookings import minsk_now
from db.database import get_db
from db.models import Booking, User
from schemas.booking import BookingState
from schemas.guard import QRScanRequest, QRScanResponse, QRScanSlot, QRVisitor

router = APIRouter(prefix="/api/v1/guard", tags=["Пост охраны (QR-контроль)"])

VALID_ACCESS_STATES = {BookingState.confirmed.value}


@router.post(
    "/scan-qr",
    response_model=QRScanResponse,
    status_code=status.HTTP_200_OK,
    summary="Проверка QR-пропуска и агрегация сессии бронирования",
)
async def scan_qr_code(
    payload: QRScanRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> QRScanResponse:
    """
    Верификация QR-кода на посту охраны.
    Агрегирует все часовые слоты по коду, вычисляет суммарную стоимость (total_price),
    проверяет валидность статусов и возвращает решение о допуске с данными посетителя при допуске.
    """
    stmt = (
        select(Booking)
        .options(selectinload(Booking.user).load_only(User.name, User.phone))
        .where(Booking.code == payload.code, Booking.series_label.is_(None))
        .order_by(Booking.date.asc(), Booking.start_time.asc())
    )
    slots = list((await db.execute(stmt)).scalars().all())

    if not slots:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"QR-пропуск с кодом '{payload.code}' не зарегистрирован в базе данных.",
        )

    first_slot = slots[0]
    last_slot = slots[-1]
    total_price = sum((slot.price for slot in slots), Decimal("0.00"))
    today = minsk_now().date()
    booking_is_for_today = all(slot.date == today for slot in slots)
    all_slots_confirmed = all(slot.state in VALID_ACCESS_STATES for slot in slots)
    same_session = all(
        slot.user_id == first_slot.user_id and slot.listing_id == first_slot.listing_id for slot in slots
    )

    if not same_session:
        access_granted = False
        reason = "Допуск запрещен: данные пропуска не совпадают."
    elif all_slots_confirmed and booking_is_for_today:
        access_granted = True
        reason = "Допуск разрешен: бесплатная бронь подтверждена и действует сегодня."
    elif not booking_is_for_today:
        access_granted = False
        reason = f"Допуск запрещен: пропуск действует только в дату бронирования ({first_slot.date})."
    else:
        access_granted = False
        invalid_states = sorted({slot.state for slot in slots if slot.state not in VALID_ACCESS_STATES})
        reason = f"Допуск запрещен: бронь не подтверждена бесплатно (статус: {', '.join(invalid_states)})."

    response.headers["Cache-Control"] = "no-store"
    return QRScanResponse(
        access_granted=access_granted,
        reason=reason,
        code=payload.code,
        school=first_slot.school,
        room=first_slot.room,
        date=first_slot.date,
        session_start=first_slot.start_time,
        session_end=last_slot.end_time,
        slots_count=len(slots),
        total_price=total_price,
        user=QRVisitor(name=first_slot.user.name, phone=first_slot.user.phone) if access_granted else QRVisitor(),
        slots=[
            QRScanSlot(date=slot.date, start_time=slot.start_time, end_time=slot.end_time, state=slot.state)
            for slot in slots
        ] if access_granted else [],
    )
