import datetime
import secrets
from typing import Dict, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from api.routers.finance import get_room_hourly_price
from db.database import get_db
from db.models import Booking, User
from schemas.booking import (
    AvailableRoomItem,
    AvailableSlotInfo,
    BookingConfirmRequest,
    BookingCreate,
    BookingResponse,
    BookingState,
    BookingStateUpdate,
    RoomType,
)

router = APIRouter(prefix="/api/v1", tags=["Помещения и бронирования"])

SCHOOL_ROOMS_CATALOG: List[Dict[str, str]] = [
    {"school": "ГУО «Средняя школа № 1 г. Минска»", "type_room": "sport_hall", "room": "Спортзал № 1"},
    {"school": "ГУО «Средняя школа № 1 г. Минска»", "type_room": "assembly_hall", "room": "Актовый зал"},
    {"school": "ГУО «Гимназия № 10 г. Минска»", "type_room": "it_lab", "room": "Кабинет информатики 301"},
    {"school": "ГУО «Гимназия № 10 г. Минска»", "type_room": "workshop", "room": "Слесарная мастерская 102"},
    {"school": "ГУО «Средняя школа № 45 г. Минска»", "type_room": "sport_hall", "room": "Большой игровой зал"},
]

STANDARD_TIME_SLOTS: List[datetime.time] = [
    datetime.time(17, 0),
    datetime.time(18, 0),
    datetime.time(19, 0),
    datetime.time(20, 0),
    datetime.time(21, 0),
]


def add_hours_to_time(base_time: datetime.time, hours_offset: int) -> datetime.time:
    """Вычисление времени окончания слота со строгим контролем перехода через полночь."""
    total_hours = base_time.hour + hours_offset
    if total_hours > 23 or (total_hours == 23 and base_time.minute > 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Интервал бронирования выходит за пределы текущих суток (после 23:00).",
        )
    return datetime.time(total_hours, base_time.minute, base_time.second)


def generate_unique_qr_code() -> str:
    """Генерация криптографически стойкого идентификатора QR-пропуска."""
    return f"QR-{secrets.token_hex(8).upper()}"


@router.get(
    "/rooms/available",
    response_model=List[AvailableRoomItem],
    status_code=status.HTTP_200_OK,
    summary="Поиск доступных помещений со слотами и ценами",
)
async def get_available_rooms(
    date: datetime.date = Query(..., description="Целевая дата бронирования (YYYY-MM-DD)"),
    type_room: RoomType = Query(..., description="Тип помещения"),
    db: AsyncSession = Depends(get_db),
) -> List[AvailableRoomItem]:
    """Формирование перечня доступных помещений, свободных 1-часовых слотов и стоимости в BYN."""
    stmt = select(Booking).where(
        and_(
            Booking.date == date,
            Booking.type_room == type_room.value,
            Booking.state != BookingState.cancelled.value,
        )
    )
    active_bookings = (await db.execute(stmt)).scalars().all()

    all_rooms_stmt = (
        select(Booking.school, Booking.type_room, Booking.room)
        .where(Booking.type_room == type_room.value)
        .distinct()
    )
    db_rooms = (await db.execute(all_rooms_stmt)).all()

    unique_rooms: Dict[Tuple[str, str], str] = {}
    for item in SCHOOL_ROOMS_CATALOG:
        if item["type_room"] == type_room.value:
            unique_rooms[(item["school"], item["room"])] = item["type_room"]

    for school_name, r_type, room_name in db_rooms:
        unique_rooms[(school_name, room_name)] = r_type

    occupied_slots_by_room: Dict[str, set] = {}
    for b in active_bookings:
        occupied_slots_by_room.setdefault(b.room, set()).add(b.start_time)

    slot_price = get_room_hourly_price(type_room)
    response_items: List[AvailableRoomItem] = []

    for (school_name, room_name), r_type in unique_rooms.items():
        occupied = occupied_slots_by_room.get(room_name, set())
        free_slots: List[AvailableSlotInfo] = []

        for slot_start in STANDARD_TIME_SLOTS:
            if slot_start not in occupied:
                slot_end = datetime.time(slot_start.hour + 1, slot_start.minute)
                free_slots.append(
                    AvailableSlotInfo(
                        start_time=slot_start,
                        end_time=slot_end,
                        price=slot_price,
                    )
                )

        if free_slots:
            response_items.append(
                AvailableRoomItem(
                    school=school_name,
                    type_room=RoomType(r_type),
                    room=room_name,
                    date=date,
                    price=slot_price,
                    available_slots=free_slots,
                )
            )

    return response_items


@router.post(
    "/bookings",
    response_model=List[BookingResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Создание серии 1-часовых слотов бронирования",
)
async def create_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
) -> List[Booking]:
    """
    Генерация отдельных 1-часовых слотов в таблице booking_table на каждый час аренды.
    Выполняет пакетную проверку коллизий и фиксирует стоимость (price) каждого слота в статусе 'pending'.
    """
    user_stmt = select(User).where(User.user_id == payload.user_id)
    user = (await db.execute(user_stmt)).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Арендатор с user_id='{payload.user_id}' не зарегистрирован в системе.",
        )

    # Расчет временных интервалов для каждого 1-часового слота
    requested_intervals: List[Tuple[datetime.time, datetime.time]] = []
    for hour_idx in range(payload.hours):
        slot_start = add_hours_to_time(payload.start_time, hour_idx)
        slot_end = add_hours_to_time(payload.start_time, hour_idx + 1)
        requested_intervals.append((slot_start, slot_end))

    requested_start_times = [interval[0] for interval in requested_intervals]

    # Проверка коллизий сразу по всем запрашиваемым часовым слотам
    collision_stmt = select(Booking).where(
        and_(
            Booking.room == payload.room,
            Booking.date == payload.date,
            Booking.start_time.in_(requested_start_times),
            Booking.state != BookingState.cancelled.value,
        )
    )
    conflicting_booking = (await db.execute(collision_stmt)).scalars().first()
    if conflicting_booking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Коллизия бронирования: помещение '{payload.room}' на дату {payload.date} "
                f"в слоте {conflicting_booking.start_time}–{conflicting_booking.end_time} уже занято "
                f"(ID заявки: {conflicting_booking.id})."
            ),
        )

    slot_price = get_room_hourly_price(payload.type_room)
    created_slots: List[Booking] = []

    for slot_start, slot_end in requested_intervals:
        booking_slot = Booking(
            school=payload.school,
            type_room=payload.type_room.value,
            room=payload.room,
            date=payload.date,
            start_time=slot_start,
            end_time=slot_end,
            price=slot_price,
            state=BookingState.pending.value,
            code=None,
            user_id=payload.user_id,
        )
        db.add(booking_slot)
        created_slots.append(booking_slot)

    await db.commit()
    for slot in created_slots:
        await db.refresh(slot)

    return created_slots


@router.post(
    "/bookings/confirm",
    response_model=List[BookingResponse],
    status_code=status.HTTP_200_OK,
    summary="Подтверждение массива слотов и генерация единого QR-кода",
)
async def confirm_bookings(
    payload: BookingConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> List[Booking]:
    """
    Принимает список ID слотов (booking_ids), генерирует единый уникальный code,
    присваивает статус 'confirmed' и возвращает массив обновленных слотов.
    """
    unique_ids = list(dict.fromkeys(payload.booking_ids))
    stmt = (
        select(Booking)
        .where(Booking.id.in_(unique_ids))
        .order_by(Booking.date.asc(), Booking.start_time.asc())
    )
    bookings = list((await db.execute(stmt)).scalars().all())

    if len(bookings) != len(unique_ids):
        found_ids = {b.id for b in bookings}
        missing_ids = [bid for bid in unique_ids if bid not in found_ids]
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Слоты бронирования со следующими ID не найдены: {missing_ids}.",
        )

    for b in bookings:
        if b.state == BookingState.cancelled.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Слот ID={b.id} отменен и не может быть подтвержден.",
            )

    shared_qr_code = generate_unique_qr_code()
    for b in bookings:
        b.state = BookingState.confirmed.value
        b.code = shared_qr_code

    await db.commit()
    for b in bookings:
        await db.refresh(b)

    return bookings


@router.get(
    "/bookings/user/{user_id}",
    response_model=List[BookingResponse],
    status_code=status.HTTP_200_OK,
    summary="Получение истории бронирований арендатора",
)
async def get_user_bookings(
    user_id: str,
    db: AsyncSession = Depends(get_db),
) -> List[Booking]:
    """Выборка всех почасовых слотов бронирования, принадлежащих указанному арендатору."""
    stmt = (
        select(Booking)
        .where(Booking.user_id == user_id)
        .order_by(Booking.date.desc(), Booking.start_time.desc())
    )
    bookings = (await db.execute(stmt)).scalars().all()
    return list(bookings)


@router.patch(
    "/bookings/{id}/state",
    response_model=BookingResponse,
    status_code=status.HTTP_200_OK,
    summary="Модификация статуса слота бронирования",
)
async def update_booking_state(
    id: int,
    payload: BookingStateUpdate,
    db: AsyncSession = Depends(get_db),
) -> Booking:
    """
    Изменение состояния слота бронирования.
    При переходе в статус 'confirmed' или 'paid' автоматически генерируется code, если он отсутствовал.
    """
    stmt = select(Booking).where(Booking.id == id)
    booking = (await db.execute(stmt)).scalar_one_or_none()

    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Бронирование с идентификатором id={id} не найдено.",
        )

    booking.state = payload.state.value
    if payload.state in (BookingState.confirmed, BookingState.paid) and not booking.code:
        booking.code = generate_unique_qr_code()

    await db.commit()
    await db.refresh(booking)
    return booking