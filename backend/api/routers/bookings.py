import datetime
import secrets
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, text
import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from api.dependencies import get_current_tenant, get_current_user
from core.config import settings
from core.uo_demo import UO_DEMO_SCHOOL, UO_DEMO_USER_ID
from api.routers.finance import get_room_hourly_price
from db.database import get_db
from db.models import Booking, RoomListing, RoomPhoto, User
from schemas.booking import (
    AvailableRoomItem,
    AvailableSlotInfo,
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

ROOM_CAPACITY: Dict[str, int] = {
    "ГУО «Средняя школа № 1 г. Минска»|Спортзал № 1": 60,
    "ГУО «Средняя школа № 1 г. Минска»|Актовый зал": 120,
    "ГУО «Гимназия № 10 г. Минска»|Кабинет информатики 301": 18,
    "ГУО «Гимназия № 10 г. Минска»|Слесарная мастерская 102": 30,
    "ГУО «Средняя школа № 45 г. Минска»|Большой игровой зал": 60,
}

DEFAULT_ROOM_IMAGES: Dict[str, str] = {
    "sport_hall": "https://images.pexels.com/photos/7201151/pexels-photo-7201151.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "assembly_hall": "https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "it_lab": "https://images.pexels.com/photos/18471531/pexels-photo-18471531.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "workshop": "https://images.pexels.com/photos/36388551/pexels-photo-36388551.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "pool": "https://images.pexels.com/photos/7430320/pexels-photo-7430320.jpeg?auto=compress&cs=tinysrgb&w=1200",
}


def add_minutes(base_time: datetime.time, offset: int) -> datetime.time:
    total = base_time.hour * 60 + base_time.minute + offset
    return datetime.time(total // 60, total % 60)


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
    """Формирование перечня помещений и свободных четвертьчасовых интервалов."""
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
    photo_rows = (await db.execute(select(RoomPhoto))).scalars().all()
    room_photos = {
        (photo.school, photo.type_room, photo.room): photo.image_url
        for photo in photo_rows
    }
    listing_rows = (await db.execute(select(RoomListing).where(RoomListing.type_room == type_room.value))).scalars().all()
    custom_listings = {
        (listing.school, listing.type_room, listing.room): listing
        for listing in listing_rows
    }

    unique_rooms: Dict[Tuple[str, str], str] = {}
    for item in SCHOOL_ROOMS_CATALOG:
        if item["type_room"] == type_room.value:
            unique_rooms[(item["school"], item["room"])] = item["type_room"]

    if settings.UO_DEMO_ENABLED:
        demo_rooms = {RoomType.sport_hall: "Спортивный зал", RoomType.assembly_hall: "Актовый зал", RoomType.it_lab: "Кабинет информатики"}
        if type_room in demo_rooms:
            unique_rooms[(UO_DEMO_SCHOOL, demo_rooms[type_room])] = type_room.value

    for school_name, r_type, room_name in db_rooms:
        unique_rooms[(school_name, room_name)] = r_type
    for listing in listing_rows:
        unique_rooms[(listing.school, listing.room)] = listing.type_room

    occupied_by_room: Dict[Tuple[str, str], List[Tuple[datetime.time, datetime.time]]] = {}
    for b in active_bookings:
        occupied_by_room.setdefault((b.school, b.room), []).append((b.start_time, b.end_time))

    slot_price = get_room_hourly_price(type_room)
    response_items: List[AvailableRoomItem] = []

    for (school_name, room_name), r_type in unique_rooms.items():
        custom = custom_listings.get((school_name, r_type, room_name))
        occupied = occupied_by_room.get((school_name, room_name), [])
        free_slots: List[AvailableSlotInfo] = []

        for minute in range(14 * 60, 21 * 60, 15):
            slot_start = datetime.time(minute // 60, minute % 60)
            if custom is not None and not (custom.available_from <= slot_start < custom.available_to):
                continue
            slot_end = add_minutes(slot_start, 15)
            if not any(start < slot_end and end > slot_start for start, end in occupied):
                free_slots.append(
                    AvailableSlotInfo(
                        start_time=slot_start,
                        end_time=slot_end,
                        price=(custom.price if custom is not None else slot_price) / 4,
                    )
                )

        response_items.append(
            AvailableRoomItem(
                school=school_name,
                type_room=RoomType(r_type),
                room=room_name,
                date=date,
                price=custom.price if custom is not None else slot_price,
                capacity=custom.capacity if custom is not None else ROOM_CAPACITY.get(f"{school_name}|{room_name}"),
                address=custom.address if custom is not None else None,
                uo=custom.uo if custom is not None else None,
                owner_id=custom.owner_id if custom is not None else None,
                available_from=custom.available_from if custom is not None else datetime.time(14),
                available_to=custom.available_to if custom is not None else datetime.time(21),
                image_url=room_photos.get(
                    (school_name, r_type, room_name),
                    DEFAULT_ROOM_IMAGES.get(r_type, "/room-placeholder.svg"),
                ),
                available_slots=free_slots,
            )
        )

    return response_items


@router.get("/uo/bookings")
async def uo_bookings(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not settings.UO_DEMO_ENABLED or current_user.role != "master" or current_user.user_id != UO_DEMO_USER_ID:
        raise HTTPException(status_code=403, detail="Нет доступа к кабинету УО.")
    rows = (await db.execute(select(Booking, User).join(User, Booking.user_id == User.user_id)
        .where(Booking.school == UO_DEMO_SCHOOL).order_by(Booking.date, Booking.start_time))).all()
    return [{**BookingResponse.model_validate(booking).model_dump(mode="json"),
             "customer_name": tenant.name, "customer_phone": tenant.phone, "customer_id": tenant.id}
            for booking, tenant in rows]


@router.post(
    "/bookings",
    response_model=List[BookingResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Создание серии 1-часовых слотов бронирования",
)
async def create_booking(
    payload: BookingCreate,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> List[Booking]:
    """
    Создание подтвержденного бронирования с QR-пропуском после проверки коллизий.
    """
    if payload.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нельзя создать бронь для другого пользователя.")

    if payload.date < datetime.date.today() or (
        payload.date == datetime.date.today() and payload.start_time <= datetime.datetime.now().time()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя забронировать прошедшее время.")

    # A transaction-scoped lock serializes overlap checks for the same room/day.
    # The old unique constraint also blocked cancelled slots and different schools.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        lock_key = int.from_bytes(hashlib.sha256(
            f"{payload.school}|{payload.type_room.value}|{payload.room}|{payload.date}".encode()
        ).digest()[:8], "big", signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    known_room = any(
        item["school"] == payload.school and item["type_room"] == payload.type_room.value and item["room"] == payload.room
        for item in SCHOOL_ROOMS_CATALOG
    )
    known_room = known_room or (settings.UO_DEMO_ENABLED and payload.school == UO_DEMO_SCHOOL and
        (payload.type_room.value, payload.room) in {
            ("sport_hall", "Спортивный зал"), ("assembly_hall", "Актовый зал"), ("it_lab", "Кабинет информатики"),
        })
    if not known_room:
        existing_room = (await db.execute(select(RoomListing.id).where(
            RoomListing.school == payload.school,
            RoomListing.type_room == payload.type_room.value,
            RoomListing.room == payload.room,
        ).limit(1))).scalar_one_or_none()
        known_room = existing_room is not None
    if not known_room:
        existing_room = (await db.execute(select(Booking.id).where(
            Booking.school == payload.school, Booking.type_room == payload.type_room.value, Booking.room == payload.room,
        ).limit(1))).scalar_one_or_none()
        if existing_room is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Помещение не найдено в каталоге.")

    custom_listing = (await db.execute(select(RoomListing).where(
        RoomListing.school == payload.school,
        RoomListing.type_room == payload.type_room.value,
        RoomListing.room == payload.room,
    ))).scalar_one_or_none()
    if custom_listing is not None:
        if payload.start_time < custom_listing.available_from or slot_end > custom_listing.available_to:
            raise HTTPException(status_code=400, detail="Выбранное время недоступно для этого помещения.")

    duration_minutes = round(payload.hours * 60)
    slot_start = payload.start_time
    slot_end = add_minutes(slot_start, duration_minutes)

    collision_stmt = select(Booking).where(
        and_(
            Booking.room == payload.room,
            Booking.school == payload.school,
            Booking.type_room == payload.type_room.value,
            Booking.date == payload.date,
            Booking.start_time < slot_end,
            Booking.end_time > slot_start,
            Booking.state != BookingState.cancelled.value,
        )
    )
    conflicting_booking = (await db.execute(collision_stmt)).scalars().first()
    if conflicting_booking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Коллизия бронирования: помещение '{payload.room}' на дату {payload.date} "
                f"в интервале {conflicting_booking.start_time}–{conflicting_booking.end_time} уже занято "
                f"(ID заявки: {conflicting_booking.id})."
            ),
        )

    hourly_price = custom_listing.price if custom_listing is not None else get_room_hourly_price(payload.type_room)
    slot_price = (hourly_price * Decimal(duration_minutes) / Decimal(60)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    # Issue an opaque, unguessable pass code as part of booking creation.
    while True:
        code = secrets.token_urlsafe(24)
        existing = (await db.execute(select(Booking.id).where(Booking.code == code).limit(1))).scalar_one_or_none()
        if existing is None:
            break

    booking = Booking(
        school=payload.school,
        type_room=payload.type_room.value,
        room=payload.room,
        date=payload.date,
        start_time=slot_start,
        end_time=slot_end,
        price=slot_price,
        state=BookingState.confirmed.value,
        code=code,
        user_id=current_user.user_id,
    )
    db.add(booking)

    await db.commit()
    await db.refresh(booking)

    return [booking]


@router.get(
    "/bookings/user/{user_id}",
    response_model=List[BookingResponse],
    status_code=status.HTTP_200_OK,
    summary="Получение истории бронирований арендатора",
)
async def get_user_bookings(
    user_id: str,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> List[Booking]:
    """Выборка всех почасовых слотов бронирования, принадлежащих указанному арендатору."""
    if user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к бронированиям другого пользователя.")
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
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> Booking:
    """
    Изменение состояния слота бронирования.
    Через этот endpoint разрешена только отмена; подтверждение выполняется при создании.
    """
    stmt = select(Booking).where(Booking.id == id)
    booking = (await db.execute(stmt)).scalar_one_or_none()

    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Бронирование с идентификатором id={id} не найдено.",
        )

    if booking.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому бронированию.")
    if payload.state != BookingState.cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Через этот endpoint доступна только отмена бронирования.")
    if booking.state == BookingState.cancelled.value:
        return booking
    start_at = datetime.datetime.combine(booking.date, booking.start_time)
    if (start_at - datetime.datetime.now()).total_seconds() < 2 * 60 * 60:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отменить бронирование можно не позднее чем за 2 часа до начала.")

    booking.state = payload.state.value

    await db.commit()
    await db.refresh(booking)
    return booking
