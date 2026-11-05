import datetime
from typing import Dict, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from db.database import get_db
from db.models import Booking, User
from schemas.booking import (
    AvailableRoomItem,
    BookingCreate,
    BookingResponse,
    BookingState,
    BookingStateUpdate,
    RoomType,
)

router = APIRouter(prefix="/api/v1", tags=["Помещения и бронирования"])

# Реестр базовых помещений учебных заведений и стандартных временных слотов
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


@router.get(
    "/rooms/available",
    response_model=List[AvailableRoomItem],
    status_code=status.HTTP_200_OK,
    summary="Поиск доступных помещений",
)
async def get_available_rooms(
    date: datetime.date = Query(..., description="Целевая дата бронирования (YYYY-MM-DD)"),
    type_room: RoomType = Query(..., description="Тип помещения"),
    db: AsyncSession = Depends(get_db),
) -> List[AvailableRoomItem]:
    """Формирование перечня доступных помещений и свободных временных слотов на заданную дату."""
    # Извлечение всех действующих бронирований (не отмененных) на указанную дату и тип помещения
    stmt = select(Booking).where(
        and_(
            Booking.date == date,
            Booking.type_room == type_room.value,
            Booking.state != BookingState.cancelled.value,
        )
    )
    active_bookings = (await db.execute(stmt)).scalars().all()

    # Формирование справочника уже существующих помещений из БД и статического каталога
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

    # Сопоставление занятых временных слотов по каждому помещению
    occupied_slots_by_room: Dict[str, set] = {}
    for b in active_bookings:
        occupied_slots_by_room.setdefault(b.room, set()).add(b.start_time)

    response_items: List[AvailableRoomItem] = []
    for (school_name, room_name), r_type in unique_rooms.items():
        occupied = occupied_slots_by_room.get(room_name, set())
        free_slots = [slot for slot in STANDARD_TIME_SLOTS if slot not in occupied]
        if free_slots:
            response_items.append(
                AvailableRoomItem(
                    school=school_name,
                    type_room=RoomType(r_type),
                    room=room_name,
                    date=date,
                    available_slots=free_slots,
                )
            )

    return response_items


@router.post(
    "/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Создание бронирования",
)
async def create_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
) -> Booking:
    """
    Создание записи о бронировании помещения.
    Включает проверку существования пользователя, программную блокировку коллизий
    по полям (room, date, start_time) и автоматическую установку статуса 'pending'.
    """
    # 1. Проверка наличия зарегистрированного арендатора
    user_stmt = select(User).where(User.user_id == payload.user_id)
    user = (await db.execute(user_stmt)).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Арендатор с user_id='{payload.user_id}' не зарегистрирован в системе.",
        )

    # 2. Программная блокировка коллизий (совпадение room, date, start_time)
    collision_stmt = select(Booking).where(
        and_(
            Booking.room == payload.room,
            Booking.date == payload.date,
            Booking.start_time == payload.start_time,
            Booking.state != BookingState.cancelled.value,
        )
    )
    existing_booking = (await db.execute(collision_stmt)).scalar_one_or_none()
    if existing_booking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Коллизия бронирования: помещение '{payload.room}' на дату {payload.date} "
                f"в {payload.start_time} уже зарезервировано (ID заявки: {existing_booking.id})."
            ),
        )

    # 3. Создание записи с принудительной инициализацией статуса 'pending'
    new_booking = Booking(
        school=payload.school,
        type_room=payload.type_room.value,
        room=payload.room,
        date=payload.date,
        start_time=payload.start_time,
        state=BookingState.pending.value,
        user_id=payload.user_id,
    )
    db.add(new_booking)
    await db.commit()
    await db.refresh(new_booking)
    return new_booking


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
    """Выборка всех заявок на бронирование, принадлежащих указанному арендатору."""
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
    summary="Модификация статуса бронирования",
)
async def update_booking_state(
    id: int,
    payload: BookingStateUpdate,
    db: AsyncSession = Depends(get_db),
) -> Booking:
    """Изменение текущего состояния заявки на бронирование по внутреннему идентификатору."""
    stmt = select(Booking).where(Booking.id == id)
    booking = (await db.execute(stmt)).scalar_one_or_none()

    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Бронирование с идентификатором id={id} не найдено.",
        )

    booking.state = payload.state.value
    await db.commit()
    await db.refresh(booking)
    return booking