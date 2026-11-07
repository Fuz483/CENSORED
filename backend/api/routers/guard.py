from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from api.routers.bookings import minsk_now
from db.database import get_db
from db.models import Booking
from schemas.booking import BookingResponse, BookingState
from schemas.guard import QRScanRequest, QRScanResponse
from schemas.user import UserResponse

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
    db: AsyncSession = Depends(get_db),
) -> QRScanResponse:
    """
    Верификация QR-кода на посту охраны.
    Агрегирует все часовые слоты по коду, вычисляет суммарную стоимость (total_price),
    проверяет валидность статусов и возвращает решение о допуске (access_granted) с профилем арендатора.
    """
    stmt = (
        select(Booking)
        .options(selectinload(Booking.user))
        .where(Booking.code == payload.code)
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
    tenant = first_slot.user

    total_price = sum((slot.price for slot in slots), Decimal("0.00"))
    all_slots_confirmed = all(slot.state in VALID_ACCESS_STATES for slot in slots)
    booking_is_for_today = all(slot.date == minsk_now().date() for slot in slots)

    if all_slots_confirmed and booking_is_for_today:
        access_granted = True
        reason = "Допуск разрешен: бесплатная бронь подтверждена и действует сегодня."
    elif not booking_is_for_today:
        access_granted = False
        reason = f"Допуск запрещен: пропуск действует только в дату бронирования ({first_slot.date})."
    else:
        access_granted = False
        invalid_states = sorted({slot.state for slot in slots if slot.state not in VALID_ACCESS_STATES})
        reason = f"Допуск запрещен: бронь не подтверждена бесплатно (статус: {', '.join(invalid_states)})."

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
        user=UserResponse.model_validate(tenant),
        slots=[BookingResponse.model_validate(s) for s in slots],
    )
