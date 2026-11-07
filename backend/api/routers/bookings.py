import datetime
import secrets
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_school, get_current_tenant
from core.config import settings
from core.phones import phone_prefix
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
    CustomerSearch,
    CustomerSuggestion,
    RentalAgreement,
    ReservedVisit,
    RoomType,
    TenantBookingResponse,
    WeeklyReservationCreate,
    WeeklyReservationEnd,
    WeeklyReservationLink,
    WeeklyReservationResponse,
)

router = APIRouter(prefix="/api/v1", tags=["Помещения и бронирования"])
RESERVED_VISIT_DAYS = 14

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
    active = select(RoomListing).where(RoomListing.archived_at.is_(None))
    if settings.UO_DEMO_ENABLED:
        return active
    return active.where(
        or_(RoomListing.school != UO_DEMO_SCHOOL, RoomListing.owner_id.is_not(None))
    )


def owned_listing(user: User, *, include_archived: bool = False):
    owner = RoomListing.owner_id == user.user_id
    if user.user_id == UO_DEMO_USER_ID:
        owner = or_(owner, and_(RoomListing.school == UO_DEMO_SCHOOL, RoomListing.owner_id.is_(None)))
    query = select(RoomListing).where(owner)
    return query if include_archived else query.where(RoomListing.archived_at.is_(None))


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
        or_(Booking.series_ends_on.is_(None), Booking.series_ends_on >= start),
        or_(Booking.date >= start, Booking.series_label.is_not(None)),
    ))).all()
    occupied_by_date: dict[datetime.date, dict[int, list[Booking]]] = {}
    for booking in active:
        booking_days = [booking.date] if booking.series_label is None else [
            day for day in dates if day >= booking.date and day.weekday() == booking.date.weekday()
            and (booking.series_ends_on is None or day <= booking.series_ends_on)
        ]
        for day in booking_days:
            occupied_by_date.setdefault(day, {}).setdefault(booking.listing_id, []).append(booking)

    now = minsk_now()
    return [room for day in dates for room in render_availability(listings, day, occupied_by_date.get(day, {}), now)]


def render_availability(
    listings: list[RoomListing], date: datetime.date, occupied: dict[int, list[Booking]], now: datetime.datetime,
) -> list[AvailableRoomItem]:
    step = 15
    result = []
    for listing in listings:
        reservations = occupied.get(listing.id, [])
        free_slots = []
        start_minute = listing.available_from.hour * 60 + listing.available_from.minute
        if listing.available_from.second or listing.available_from.microsecond:
            start_minute += 1
        start_minute = max(14 * 60, ((start_minute + step - 1) // step) * step)
        end_minute = min(21 * 60, listing.available_to.hour * 60 + listing.available_to.minute)
        for minute in range(start_minute, end_minute - step + 1, step):
            start = datetime.time(minute // 60, minute % 60)
            if datetime.datetime.combine(date, start) <= now:
                continue
            end = add_minutes(start, step)
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
        .where(Booking.listing_id.in_(owned_listing(current_user, include_archived=True).with_only_columns(RoomListing.id)),
               Booking.series_label.is_(None))
        .order_by(Booking.date, Booking.start_time))).all()
    return [{**BookingResponse.model_validate(booking).model_dump(mode="json"),
             "customer_name": tenant.name, "customer_phone": tenant.phone, "customer_id": tenant.id}
            for booking, tenant in rows]


@router.patch("/uo/bookings/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_customer_booking(
    booking_id: int,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
) -> Booking:
    listing_id = await db.scalar(select(Booking.listing_id).where(
        Booking.id == booking_id, Booking.series_label.is_(None),
        Booking.listing_id.in_(owned_listing(current_user, include_archived=True).with_only_columns(RoomListing.id)),
    ))
    if listing_id is None:
        raise HTTPException(status_code=404, detail="Бронь вашего учреждения не найдена.")
    await db.execute(select(RoomListing.id).where(RoomListing.id == listing_id).with_for_update())
    booking = await db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update())
    if booking is None:
        raise HTTPException(status_code=404, detail="Бронь вашего учреждения не найдена.")
    if booking.cancelled_by_school:
        return booking
    if booking.state not in {BookingState.pending.value, BookingState.confirmed.value, BookingState.paid.value} or (
        datetime.datetime.combine(booking.date, booking.start_time) <= minsk_now()
    ):
        raise HTTPException(status_code=409, detail="Отменить можно только предстоящую активную бронь.")
    booking.state = BookingState.cancelled.value
    booking.cancelled_by_school = True
    await db.commit()
    return booking


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
    if payload.listing_id is not None:
        query = query.where(RoomListing.id == payload.listing_id)
    listing = await db.scalar(query.with_for_update() if lock else query)
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение не найдено в каталоге.")
    return listing


async def validate_reserved_visit(
    db: AsyncSession, payload: BookingDetails, listing: RoomListing, end: datetime.time,
) -> None:
    if payload.reservation_id is None:
        return
    reservation = await db.scalar(occupancy().where(
        Booking.id == payload.reservation_id, Booking.listing_id == listing.id,
        Booking.series_label.is_not(None), Booking.series_tenant_id == payload.user_id,
        Booking.start_time == payload.start_time, Booking.end_time == end,
    ))
    if (
        reservation is None or payload.date < reservation.date
        or payload.date.weekday() != reservation.date.weekday()
        or (reservation.series_ends_on is not None and payload.date > reservation.series_ends_on)
        or (payload.date - minsk_now().date()).days >= RESERVED_VISIT_DAYS
    ):
        raise HTTPException(status_code=403, detail="Этот визит по серии вам недоступен.")
    if await db.scalar(select(Booking.id).where(
        Booking.reservation_id == reservation.id, Booking.date == payload.date, Booking.cancelled_by_school.is_(True),
    ).limit(1)):
        raise HTTPException(status_code=409, detail="Школа отменила этот визит.")


@router.post("/bookings/agreement", response_model=RentalAgreement)
async def preview_agreement(
    payload: BookingDetails,
    current_user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> RentalAgreement:
    listing = await tenant_listing(payload, current_user, db)
    end = validate_interval(payload, listing)
    await validate_reserved_visit(db, payload, listing, end)
    return build_rental_agreement(listing, current_user, payload, end)


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
    await validate_reserved_visit(db, payload, listing, end)
    if not payload.agreement_accepted:
        raise HTTPException(status_code=400, detail="Примите условия договора аренды.")
    agreement = build_rental_agreement(listing, current_user, payload, end)
    if not secrets.compare_digest(agreement.token, payload.agreement_token):
        raise HTTPException(status_code=409, detail="Откройте актуальный договор аренды и подтвердите согласие.")
    candidates = (await db.scalars(overlapping_orders(listing, payload.start_time, end).where(
        or_(Booking.series_ends_on.is_(None), Booking.series_ends_on >= payload.date),
        or_(Booking.date == payload.date, and_(Booking.series_label.is_not(None), Booking.date < payload.date))
    ))).all()
    if any(booking.id != payload.reservation_id and booking.date.weekday() == payload.date.weekday() for booking in candidates):
        raise HTTPException(status_code=409, detail="Выбранное время уже занято разовой или еженедельной бронью.")

    price = (listing.price * Decimal(str(payload.hours))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if price > Decimal("99999999.99"):
        raise HTTPException(status_code=422, detail="Стоимость брони слишком велика. Выберите интервал короче.")
    booking = Booking(
        listing_id=listing.id, school=listing.school, type_room=listing.type_room, room=listing.room,
        date=payload.date, start_time=payload.start_time, end_time=end,
        price=price,
        state=BookingState.confirmed.value, code=secrets.token_urlsafe(24), user_id=current_user.user_id,
        reservation_id=payload.reservation_id,
        agreement_version=agreement.version, agreement_text=agreement.text,
        agreement_accepted_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(booking)
    await db.commit()
    return [booking]


def series_response(group: list[Booking], customer_name: str | None) -> WeeklyReservationResponse:
    first = min(group, key=lambda item: (item.date, item.id))
    return WeeklyReservationResponse(
        **BookingResponse.model_validate(first).model_dump(),
        series_label=first.series_label,
        weekdays=sorted({item.date.weekday() for item in group}),
        customer_name=customer_name,
        ends_on=first.series_ends_on,
    )


@router.get("/uo/weekly-reservations", response_model=list[WeeklyReservationResponse])
async def weekly_reservations(current_user: User = Depends(get_current_school), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(occupancy().add_columns(User.name).outerjoin(User, Booking.series_tenant_id == User.user_id).where(
        Booking.listing_id.in_(owned_listing(current_user).with_only_columns(RoomListing.id)),
        Booking.series_label.is_not(None),
        or_(Booking.series_ends_on.is_(None), Booking.series_ends_on >= minsk_now().date()),
    ).order_by(Booking.date, Booking.start_time, Booking.id))).all()
    groups: dict[str, tuple[list[Booking], str | None]] = {}
    for reservation, name in rows:
        groups.setdefault(reservation.series_group_id, ([], name))[0].append(reservation)
    return [series_response(group, name) for group, name in groups.values()]


async def registered_tenant(db: AsyncSession, phone: str, customer_id: str | None = None) -> User:
    query = select(User).where(
        User.phone == phone, User.role == "tenant", User.password_hash.is_not(None),
    )
    if customer_id is not None:
        query = query.where(User.user_id == customer_id)
    matches = (await db.scalars(query.limit(2))).all()
    if not matches:
        raise HTTPException(status_code=404, detail="По этому телефону не найден зарегистрированный арендатор.")
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="У номера несколько арендаторов. Выберите клиента из подсказок.")
    return matches[0]


@router.post("/uo/customers/search", response_model=list[CustomerSuggestion])
async def customer_suggestions(
    payload: CustomerSearch,
    response: Response,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
) -> list[CustomerSuggestion]:
    response.headers["Cache-Control"] = "no-store"
    prefix = phone_prefix(payload.phone)
    national_digits = len(prefix) - (4 if prefix.startswith("+375") else 1)
    if national_digits < 6:
        return []
    matches = (await db.execute(select(User.user_id, User.phone, User.name).where(
        User.role == "tenant", User.password_hash.is_not(None), User.phone.startswith(prefix),
    ).order_by(User.phone, User.name, User.user_id).limit(5))).all()
    return [CustomerSuggestion(user_id=user_id, phone=phone, name=name) for user_id, phone, name in matches]


@router.post("/uo/weekly-reservations", response_model=WeeklyReservationResponse, status_code=201)
async def create_weekly_reservation(
    payload: WeeklyReservationCreate,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    listing = await db.scalar(owned_listing(current_user).where(RoomListing.id == payload.listing_id).with_for_update())
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение вашего учреждения не найдено.")
    weekdays = set(payload.weekdays) or {payload.date.weekday()}
    offsets = {day: (day - payload.date.weekday()) % 7 for day in weekdays}
    if payload.date > datetime.date.max - datetime.timedelta(days=max(offsets.values())):
        raise HTTPException(status_code=422, detail="Диапазон дат выходит за пределы календаря.")
    first_dates = {day: payload.date + datetime.timedelta(days=offset) for day, offset in offsets.items()}
    first_date = min(first_dates.values())
    if payload.ends_on is not None and payload.ends_on < max(first_dates.values()):
        raise HTTPException(status_code=422, detail="Дата окончания должна включать первое занятие для каждого выбранного дня.")
    if payload.date < minsk_now().date():
        raise HTTPException(status_code=400, detail="Дата начала серии уже прошла.")
    end = validate_interval(payload.model_copy(update={"date": first_date}), listing)
    customer = await registered_tenant(db, payload.customer_phone, payload.customer_id) if payload.customer_phone else None
    await check_series_overlap(db, listing.id, payload.start_time, end, first_dates, payload.ends_on)

    group_id = secrets.token_hex(16)
    group = [Booking(
        listing_id=listing.id, school=listing.school, type_room=listing.type_room, room=listing.room,
        date=day, start_time=payload.start_time, end_time=end, price=Decimal("0.00"),
        state=BookingState.confirmed.value, user_id=current_user.user_id, series_label=payload.label,
        series_group_id=group_id, series_tenant_id=customer.user_id if customer else None,
        series_ends_on=payload.ends_on,
    ) for day in sorted(first_dates.values())]
    db.add_all(group)
    await db.commit()
    return series_response(group, customer.name if customer else None)


async def school_series(db: AsyncSession, user: User, reservation_id: int) -> list[Booking]:
    reservation = await db.get(Booking, reservation_id)
    if reservation is None or reservation.series_group_id is None or not await db.scalar(
        owned_listing(user).where(RoomListing.id == reservation.listing_id).with_for_update()
    ):
        raise HTTPException(status_code=404, detail="Серия вашего учреждения не найдена.")
    return list((await db.scalars(select(Booking).where(
        Booking.series_group_id == reservation.series_group_id,
    ).execution_options(populate_existing=True))).all())


async def check_series_overlap(
    db: AsyncSession, listing_id: int, start: datetime.time, end: datetime.time,
    first_dates: dict[int, datetime.date], ends_on: datetime.date | None, current_group: list[Booking] | None = None,
) -> None:
    candidates = (await db.scalars(occupancy().where(
        Booking.listing_id == listing_id, Booking.start_time < end, Booking.end_time > start,
        or_(Booking.series_label.is_not(None), Booking.date >= min(first_dates.values())),
    ))).all()
    current_ids = {item.id for item in current_group or []}
    for booking in candidates:
        first = first_dates.get(booking.date.weekday())
        if first is None or booking.id in current_ids or booking.reservation_id in current_ids:
            continue
        overlap = max(first, booking.date)
        booking_end = booking.date if booking.series_label is None else booking.series_ends_on
        if (booking_end is None or overlap <= booking_end) and (ends_on is None or overlap <= ends_on):
            raise HTTPException(status_code=409, detail="Серия пересекается с существующей бронью. Выберите другой день или время.")


@router.patch("/uo/weekly-reservations/{reservation_id}/end-date", response_model=WeeklyReservationResponse)
async def set_weekly_end_date(
    reservation_id: int,
    payload: WeeklyReservationEnd,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    group = await school_series(db, current_user, reservation_id)
    first = group[0]
    if first.state == BookingState.cancelled.value or (
        first.series_ends_on is not None and first.series_ends_on < minsk_now().date()
    ):
        raise HTTPException(status_code=409, detail="Серия уже завершена.")
    if payload.ends_on < max(minsk_now().date(), *(item.date for item in group)):
        raise HTTPException(status_code=422, detail="Дата окончания должна включать первое занятие для каждого выбранного дня.")
    if first.series_ends_on is not None and payload.ends_on > first.series_ends_on:
        await check_series_overlap(db, first.listing_id, first.start_time, first.end_time,
                                   {item.date.weekday(): item.date for item in group}, payload.ends_on, group)
    for reservation in group:
        reservation.series_ends_on = payload.ends_on
    customer = await db.scalar(select(User.name).where(User.user_id == first.series_tenant_id))
    await db.commit()
    return series_response(group, customer)


@router.patch("/uo/weekly-reservations/{reservation_id}/customer", response_model=WeeklyReservationResponse)
async def link_weekly_customer(
    reservation_id: int,
    payload: WeeklyReservationLink,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    group = await school_series(db, current_user, reservation_id)
    if all(item.state == BookingState.cancelled.value or (
        item.series_ends_on is not None and item.series_ends_on < minsk_now().date()
    ) for item in group):
        raise HTTPException(status_code=409, detail="Серия уже завершена.")
    customer = await registered_tenant(db, payload.customer_phone, payload.customer_id)
    for reservation in group:
        reservation.series_tenant_id = customer.user_id
    await db.commit()
    return series_response(group, customer.name)


@router.patch("/uo/weekly-reservations/{reservation_id}/cancel", response_model=WeeklyReservationResponse)
async def cancel_weekly_reservation(
    reservation_id: int,
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    group = await school_series(db, current_user, reservation_id)
    for reservation in group:
        reservation.state = BookingState.cancelled.value
    await db.commit()
    return series_response(group, None)


@router.get("/bookings/reserved-visits", response_model=list[ReservedVisit])
async def reserved_visits(current_user: User = Depends(get_current_tenant), db: AsyncSession = Depends(get_db)):
    now = minsk_now()
    days = [now.date() + datetime.timedelta(days=offset) for offset in range(RESERVED_VISIT_DAYS)]
    holds = (await db.scalars(occupancy().where(
        Booking.series_tenant_id == current_user.user_id, Booking.series_label.is_not(None),
        Booking.listing_id.in_(visible_listings().with_only_columns(RoomListing.id)),
        Booking.date <= days[-1],
        or_(Booking.series_ends_on.is_(None), Booking.series_ends_on >= days[0]),
    ))).all()
    claimed = set((await db.execute(select(Booking.reservation_id, Booking.date).where(
        or_(Booking.state != BookingState.cancelled.value, Booking.cancelled_by_school.is_(True)),
        Booking.reservation_id.in_([hold.id for hold in holds]), Booking.date.between(days[0], days[-1]),
    ))).all())
    return sorted([
        ReservedVisit(
            reservation_id=hold.id, listing_id=hold.listing_id, series_label=hold.series_label,
            date=day, start_time=hold.start_time, end_time=hold.end_time,
        )
        for hold in holds for day in days
        if day >= hold.date and day.weekday() == hold.date.weekday()
        and (hold.series_ends_on is None or day <= hold.series_ends_on)
        and datetime.datetime.combine(day, hold.start_time) > now and (hold.id, day) not in claimed
    ], key=lambda visit: (visit.date, visit.start_time, visit.reservation_id))


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
    stmt = select(Booking).where(Booking.id == id, Booking.series_label.is_(None)).with_for_update()
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
