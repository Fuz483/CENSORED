import datetime
import secrets
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_school, get_current_tenant
from core.config import settings
from core.rental_agreement import build_rental_agreement
from core.uo_demo import UO_DEMO_SCHOOL, UO_DEMO_USER_ID
from db.database import get_db
from db.models import Booking, RoomListing, User
from schemas.booking import (
    AvailableRoomItem,
    AvailableSlotInfo,
    BookingCreate,
    BookingDetails,
    BookingInterval,
    BookingResponse,
    BookingState,
    BookingStateUpdate,
    RentalAgreement,
    RoomType,
    TenantBookingResponse,
    WeeklyReservationCreate,
    WeeklyReservationResponse,
)

router = APIRouter(prefix="/api/v1", tags=["Помещения и бронирования"])

DEFAULT_ROOM_IMAGES: dict[str, str] = {
    "sport_hall": "https://images.pexels.com/photos/7201151/pexels-photo-7201151.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "assembly_hall": "https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "it_lab": "https://images.pexels.com/photos/18471531/pexels-photo-18471531.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "workshop": "https://images.pexels.com/photos/36388551/pexels-photo-36388551.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "pool": "https://images.pexels.com/photos/7430320/pexels-photo-7430320.jpeg?auto=compress&cs=tinysrgb&w=1200",
}


def minsk_now() -> datetime.datetime:
    return datetime.datetime.now(ZoneInfo("Europe/Minsk")).replace(tzinfo=None)


def add_minutes(base_time: datetime.time, offset: int) -> datetime.time:
    total = base_time.hour * 60 + base_time.minute + offset
    return datetime.time(total // 60, total % 60)


def visible_listings():
    if settings.UO_DEMO_ENABLED:
        return select(RoomListing)
    return select(RoomListing).where(
        or_(RoomListing.school != UO_DEMO_SCHOOL, RoomListing.owner_id.is_not(None))
    )


def owned_listing(user: User):
    return select(RoomListing).where(
        RoomListing.school == user.name,
        or_(RoomListing.owner_id == user.user_id, RoomListing.owner_id.is_(None)),
    )


def occupancy():
    return select(Booking).where(Booking.state != BookingState.cancelled.value)


@router.get("/rooms/available", response_model=list[AvailableRoomItem])
async def get_available_rooms(
    date: datetime.date = Query(...),
    type_room: RoomType = Query(...),
    db: AsyncSession = Depends(get_db),
) -> list[AvailableRoomItem]:
    return await catalog_availability(db, date, 1, type_room)


@router.get("/rooms/catalog", response_model=list[AvailableRoomItem])
async def get_catalog(
    start: Annotated[datetime.date, Query()],
    days: Annotated[int, Query(ge=1, le=7)] = 7,
    db: AsyncSession = Depends(get_db),
) -> list[AvailableRoomItem]:
    if start > datetime.date.max - datetime.timedelta(days=days - 1):
        raise HTTPException(status_code=422, detail="Диапазон дат выходит за пределы календаря.")
    return await catalog_availability(db, start, days)


async def catalog_availability(
    db: AsyncSession, start: datetime.date, days: int, type_room: RoomType | None = None,
) -> list[AvailableRoomItem]:
    dates = [start + datetime.timedelta(days=offset) for offset in range(days)]
    listing_query = visible_listings().order_by(RoomListing.id)
    if type_room is not None:
        listing_query = listing_query.where(RoomListing.type_room == type_room.value)
    listings = (await db.scalars(listing_query)).all()
    if not listings:
        return []

    active = (await db.scalars(occupancy().where(
        Booking.listing_id.in_([listing.id for listing in listings]),
        Booking.date <= dates[-1],
        or_(Booking.date >= start, Booking.series_label.is_not(None)),
    ))).all()
    occupied_by_date: dict[datetime.date, dict[int, list[Booking]]] = {}
    for booking in active:
        booking_days = [booking.date] if booking.series_label is None else [
            day for day in dates if day >= booking.date and day.weekday() == booking.date.weekday()
        ]
        for day in booking_days:
            occupied_by_date.setdefault(day, {}).setdefault(booking.listing_id, []).append(booking)

    return [room for day in dates for room in render_availability(listings, day, occupied_by_date.get(day, {}))]


def render_availability(
    listings: list[RoomListing], date: datetime.date, occupied: dict[int, list[Booking]],
) -> list[AvailableRoomItem]:
    result = []
    for listing in listings:
        reservations = occupied.get(listing.id, [])
        free_slots = []
        start_minute = listing.available_from.hour * 60 + listing.available_from.minute
        end_minute = listing.available_to.hour * 60 + listing.available_to.minute
        for minute in range(start_minute, end_minute, 15):
            start = datetime.time(minute // 60, minute % 60)
            end = add_minutes(start, 15)
            if not any(booking.start_time < end and booking.end_time > start for booking in reservations):
                free_slots.append(AvailableSlotInfo(start_time=start, end_time=end, price=listing.price / 4))
        result.append(AvailableRoomItem(
            id=listing.id, school=listing.school, type_room=listing.type_room, room=listing.room,
            date=date, price=listing.price, capacity=listing.capacity, address=listing.address,
            city=listing.city, city_district=listing.city_district,
            uo=listing.uo, owner_id=listing.owner_id or (
                UO_DEMO_USER_ID if listing.school == UO_DEMO_SCHOOL else None
            ),
            available_from=listing.available_from, available_to=listing.available_to,
            image_url=listing.image_url or DEFAULT_ROOM_IMAGES.get(listing.type_room, "/room-placeholder.svg"),
            available_slots=free_slots,
        ))
    return result


@router.get("/uo/bookings")
async def uo_bookings(current_user: User = Depends(get_current_school), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Booking, User).join(User, Booking.user_id == User.user_id)
        .where(Booking.listing_id.in_(owned_listing(current_user).with_only_columns(RoomListing.id)),
               Booking.series_label.is_(None))
        .order_by(Booking.date, Booking.start_time))).all()
    return [{**BookingResponse.model_validate(booking).model_dump(mode="json"),
             "customer_name": tenant.name, "customer_phone": tenant.phone, "customer_id": tenant.id}
            for booking, tenant in rows]


def validate_interval(payload: BookingInterval, listing: RoomListing) -> datetime.time:
    now = minsk_now()
    if datetime.datetime.combine(payload.date, payload.start_time) <= now:
        raise HTTPException(status_code=400, detail="Нельзя забронировать прошедшее время.")
    end = add_minutes(payload.start_time, round(payload.hours * 60))
    if payload.start_time < listing.available_from or end > listing.available_to:
        raise HTTPException(status_code=400, detail="Выбранное время недоступно для этого помещения.")
    return end


async def tenant_listing(payload: BookingDetails, user: User, db: AsyncSession, *, lock: bool = False) -> RoomListing:
    if payload.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="Нельзя создать бронь для другого пользователя.")
    query = visible_listings().where(
        RoomListing.school == payload.school, RoomListing.type_room == payload.type_room.value,
        RoomListing.room == payload.room,
    )
    listing = await db.scalar(query.with_for_update() if lock else query)
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение не найдено в каталоге.")
    return listing


@router.post("/bookings/agreement", response_model=RentalAgreement)
async def preview_agreement(
    payload: BookingDetails,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> RentalAgreement:
    listing = await tenant_listing(payload, current_user, db)
    return build_rental_agreement(listing, current_user, payload, validate_interval(payload, listing))


def overlapping_orders(listing: RoomListing, start: datetime.time, end: datetime.time):
    return occupancy().where(Booking.listing_id == listing.id, Booking.start_time < end, Booking.end_time > start)


@router.post("/bookings", response_model=list[TenantBookingResponse], status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[Booking]:
    # Regular orders and weekly reservations lock the same listing before checking overlaps.
    listing = await tenant_listing(payload, current_user, db, lock=True)
    end = validate_interval(payload, listing)
    if not payload.agreement_accepted:
        raise HTTPException(status_code=400, detail="Примите условия договора аренды.")
    agreement = build_rental_agreement(listing, current_user, payload, end)
    if not secrets.compare_digest(agreement.token, payload.agreement_token):
        raise HTTPException(status_code=409, detail="Откройте актуальный договор аренды и подтвердите согласие.")
    candidates = (await db.scalars(overlapping_orders(listing, payload.start_time, end).where(
        or_(Booking.date == payload.date, and_(Booking.series_label.is_not(None), Booking.date < payload.date))
    ))).all()
    if any(booking.date.weekday() == payload.date.weekday() for booking in candidates):
        raise HTTPException(status_code=409, detail="Выбранное время уже занято разовой или еженедельной бронью.")

    price = (listing.price * Decimal(str(payload.hours))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if price > Decimal("99999999.99"):
        raise HTTPException(status_code=422, detail="Стоимость брони слишком велика. Выберите интервал короче.")
    booking = Booking(
        listing_id=listing.id, school=listing.school, type_room=listing.type_room, room=listing.room,
        date=payload.date, start_time=payload.start_time, end_time=end,
        price=price,
        state=BookingState.confirmed.value, code=secrets.token_urlsafe(24), user_id=current_user.user_id,
        agreement_version=agreement.version, agreement_text=agreement.text,
        agreement_accepted_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(booking)
    await db.commit()
    return [booking]


@router.get("/uo/weekly-reservations", response_model=list[WeeklyReservationResponse])
async def weekly_reservations(current_user: User = Depends(get_current_school), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(occupancy().where(
        Booking.listing_id.in_(owned_listing(current_user).with_only_columns(RoomListing.id)),
        Booking.series_label.is_not(None),
    ).order_by(Booking.date, Booking.start_time))).all()


@router.post("/uo/weekly-reservations", response_model=WeeklyReservationResponse, status_code=201)
async def create_weekly_reservation(
    payload: WeeklyReservationCreate,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.scalar(owned_listing(current_user).where(RoomListing.id == payload.listing_id).with_for_update())
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение вашего учреждения не найдено.")
    end = validate_interval(payload, listing)
    candidates = (await db.scalars(overlapping_orders(listing, payload.start_time, end).where(
        or_(Booking.series_label.is_not(None), Booking.date >= payload.date)
    ))).all()
    if any(booking.date.weekday() == payload.date.weekday() for booking in candidates):
        raise HTTPException(status_code=409, detail="Серия пересекается с существующей бронью. Выберите другой день или время.")

    reservation = Booking(
        listing_id=listing.id, school=listing.school, type_room=listing.type_room, room=listing.room,
        date=payload.date, start_time=payload.start_time, end_time=end, price=Decimal("0.00"),
        state=BookingState.confirmed.value, user_id=current_user.user_id, series_label=payload.label,
    )
    db.add(reservation)
    await db.commit()
    return reservation


@router.patch("/uo/weekly-reservations/{reservation_id}/cancel", response_model=WeeklyReservationResponse)
async def cancel_weekly_reservation(
    reservation_id: int,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    reservation = await db.scalar(select(Booking).where(
        Booking.id == reservation_id, Booking.series_label.is_not(None),
        Booking.listing_id.in_(owned_listing(current_user).with_only_columns(RoomListing.id)),
    ))
    if reservation is None:
        raise HTTPException(status_code=404, detail="Серия вашего учреждения не найдена.")
    reservation.state = BookingState.cancelled.value
    await db.commit()
    return reservation


@router.get(
    "/bookings/user/{user_id}",
    response_model=list[TenantBookingResponse],
    status_code=status.HTTP_200_OK,
    summary="Получение истории бронирований арендатора",
)
async def get_user_bookings(
    user_id: str,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[Booking]:
    """Выборка всех почасовых слотов бронирования, принадлежащих указанному арендатору."""
    if user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к бронированиям другого пользователя.")
    stmt = (
        select(Booking)
        .where(Booking.user_id == user_id, Booking.series_label.is_(None))
        .order_by(Booking.date.desc(), Booking.start_time.desc())
    )
    bookings = (await db.execute(stmt)).scalars().all()
    return list(bookings)


@router.patch(
    "/bookings/{id}/state",
    response_model=TenantBookingResponse,
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
    stmt = select(Booking).where(Booking.id == id, Booking.series_label.is_(None))
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
    if (start_at - minsk_now()).total_seconds() < 2 * 60 * 60:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отменить бронирование можно не позднее чем за 2 часа до начала.")

    booking.state = payload.state.value

    await db.commit()
    await db.refresh(booking)
    return booking
