import datetime
import uuid
from decimal import Decimal
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from PIL import Image
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from api.dependencies import get_current_school
from api.routers.bookings import minsk_now, owned_listing, visible_listings
from db.database import get_db
from db.models import Booking, RoomListing, User
from schemas.booking import BookingState, RoomType

router = APIRouter(prefix="/api/v1/rooms", tags=["Фотографии помещений"])
media_router = APIRouter(prefix="/media/catalog", tags=["Фотографии помещений"])
MAX_PHOTO_BYTES = 8 * 1024 * 1024
MAX_PHOTO_PIXELS = 32_000_000
IMAGE_TYPES = {
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
}


def validate_photo_contents(contents: bytes, content_type: str) -> None:
    too_large = "Разрешение фотографии не должно превышать 32 мегапикселя."
    try:
        with Image.open(BytesIO(contents), formats=("JPEG", "PNG", "WEBP")) as photo:
            if Image.MIME.get(photo.format) != content_type:
                raise ValueError("Image format does not match its media type.")
            if photo.width * photo.height > MAX_PHOTO_PIXELS:
                raise HTTPException(status_code=413, detail=too_large)
            photo.load()
    except Image.DecompressionBombError as error:
        raise HTTPException(status_code=413, detail=too_large) from error
    except (OSError, SyntaxError, ValueError) as error:
        raise HTTPException(status_code=415, detail="Формат файла не соответствует изображению.") from error


async def read_photo(file: UploadFile) -> tuple[bytes, str]:
    content_type = file.content_type or ""
    validate = IMAGE_TYPES.get(content_type)
    if validate is None:
        raise HTTPException(status_code=415, detail="Поддерживаются фотографии JPG, PNG и WebP.")
    contents = await file.read(MAX_PHOTO_BYTES + 1)
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Размер фотографии не должен превышать 8 МБ.")
    if not validate(contents):
        raise HTTPException(status_code=415, detail="Формат файла не соответствует изображению.")
    await run_in_threadpool(validate_photo_contents, contents, content_type)
    return contents, content_type


def assign_photo(listing: RoomListing, contents: bytes, content_type: str) -> None:
    listing.photo_data = contents
    listing.photo_type = content_type
    listing.image_url = f"/media/catalog/{listing.id}?v={uuid.uuid4().hex}"
    listing.image_updated_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


def availability_window(available_from: str, available_to: str) -> tuple[datetime.time, datetime.time]:
    try:
        start = datetime.time.fromisoformat(available_from)
        end = datetime.time.fromisoformat(available_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Проверьте время доступности помещения.") from error
    if (start.tzinfo or end.tzinfo or start.microsecond or end.microsecond or
            start.second or start.minute % 15 or end.second or end.minute % 15 or
            start < datetime.time(14) or end > datetime.time(21) or
            start >= end or (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute) < 60):
        raise HTTPException(status_code=422, detail="Укажите доступность с шагом 15 минут в диапазоне 14:00–21:00.")
    return start, end


def listing_response(listing: RoomListing) -> dict[str, object]:
    return {
        "id": listing.id,
        "owner_id": listing.owner_id,
        "school": listing.school,
        "uo": listing.uo,
        "type_room": listing.type_room,
        "room": listing.room,
        "address": listing.address,
        "city": listing.city,
        "city_district": listing.city_district,
        "capacity": listing.capacity,
        "price": listing.price,
        "available_from": listing.available_from,
        "available_to": listing.available_to,
        "image_url": listing.image_url,
    }


async def save_listing(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Помещение с таким названием уже есть в каталоге.") from error


async def lock_owned_listing(
    listing_id: int, user: User, db: AsyncSession, *, include_archived: bool = False,
) -> RoomListing:
    listing = await db.scalar(owned_listing(user, include_archived=include_archived).where(
        RoomListing.id == listing_id,
    ).with_for_update())
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение вашего учреждения не найдено.")
    return listing


async def has_active_or_future_bookings(listing_id: int, db: AsyncSession) -> bool:
    now = minsk_now()
    today = now.date()
    bookings = (await db.execute(select(
        Booking.date, Booking.end_time, Booking.series_label, Booking.series_ends_on,
    ).where(
        Booking.listing_id == listing_id,
        Booking.state.not_in((BookingState.cancelled.value, BookingState.completed.value)),
        or_(
            Booking.date >= today,
            and_(
                Booking.series_label.is_not(None),
                or_(Booking.series_ends_on.is_(None), Booking.series_ends_on >= today),
            ),
        ),
    ))).all()
    for first_date, end_time, series_label, series_end in bookings:
        if series_label is None:
            last_date = first_date
        elif series_end is None:
            return True
        else:
            last_date = series_end - datetime.timedelta(days=(series_end.weekday() - first_date.weekday()) % 7)
        if last_date >= first_date and datetime.datetime.combine(last_date, end_time) > now:
            return True
    return False


@media_router.get("/{listing_id}")
async def catalog_photo(listing_id: int, db: AsyncSession = Depends(get_db)) -> Response:
    photo = (await db.execute(visible_listings().with_only_columns(
        RoomListing.photo_data, RoomListing.photo_type,
    ).where(RoomListing.id == listing_id))).one_or_none()
    if photo is None or photo.photo_data is None:
        raise HTTPException(status_code=404, detail="Фото не найдено.")
    return Response(photo.photo_data, media_type=photo.photo_type, headers={"Cache-Control": "public, max-age=300"})


@router.post("/photo", status_code=status.HTTP_200_OK)
async def save_room_photo(
    school: str = Form(..., min_length=2, max_length=255),
    type_room: RoomType = Form(...),
    room: str = Form(..., min_length=1, max_length=128),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
    listing_id: Annotated[int | None, Form(gt=0)] = None,
):
    """Save an authenticated institution's room image on persistent backend storage."""
    school = school.strip()
    if school != current_user.name:
        raise HTTPException(status_code=403, detail="Можно менять фото только помещений своего учреждения.")

    query = owned_listing(current_user).where(
        RoomListing.school == school, RoomListing.type_room == type_room.value, RoomListing.room == room.strip(),
    )
    if listing_id is not None:
        query = query.where(RoomListing.id == listing_id)
    listing = await db.scalar(query.with_for_update())
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение не найдено в каталоге.")

    assign_photo(listing, *await read_photo(file))
    await db.commit()
    return {"school": listing.school, "type_room": listing.type_room, "room": listing.room, "image_url": listing.image_url}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room_listing(
    school: str = Form(..., min_length=2, max_length=255),
    uo: str = Form("", max_length=255),
    type_room: RoomType = Form(...),
    room: str = Form(..., min_length=1, max_length=128),
    address: str = Form(..., min_length=1, max_length=512),
    capacity: int = Form(..., gt=0, le=2_147_483_647),
    price: Decimal = Form(..., gt=0, le=Decimal("99999999.99")),
    available_from: str = Form(...),
    available_to: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
    city: Annotated[str, Form(max_length=100)] = "",
    city_district: Annotated[str, Form(max_length=100)] = "",
):
    """Publish a new room with its first photo for the authenticated institution."""
    if school.strip() != current_user.name:
        raise HTTPException(status_code=403, detail="Можно добавлять помещения только своего учреждения.")
    start, end = availability_window(available_from, available_to)

    school = school.strip()
    room = room.strip()
    if not room or not address.strip():
        raise HTTPException(status_code=422, detail="Укажите название и адрес помещения.")
    if city_district.strip() and not city.strip():
        raise HTTPException(status_code=422, detail="Для района укажите город.")

    listing = RoomListing(
        owner_id=current_user.user_id,
        school=school,
        uo=uo.strip(),
        type_room=type_room.value,
        room=room,
        address=address.strip(),
        city=city.strip() or None,
        city_district=city_district.strip() or None,
        capacity=capacity,
        price=price,
        available_from=start,
        available_to=end,
    )
    photo = await read_photo(file)
    db.add(listing)
    try:
        await db.flush()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Помещение с таким названием уже есть в каталоге.") from error
    assign_photo(listing, *photo)
    await save_listing(db)
    return listing_response(listing)


@router.patch("/{listing_id}", response_model=None)
async def edit_room_listing(
    listing_id: int,
    request: Request,
    current_user: Annotated[User, Depends(get_current_school)],
    db: Annotated[AsyncSession, Depends(get_db)],
    school: Annotated[str | None, Form(min_length=2, max_length=255)] = None,
    uo: Annotated[str | None, Form(max_length=255)] = None,
    type_room: Annotated[RoomType | None, Form()] = None,
    room: Annotated[str | None, Form(max_length=128)] = None,
    address: Annotated[str | None, Form(max_length=512)] = None,
    city: Annotated[str | None, Form(max_length=100)] = None,
    city_district: Annotated[str | None, Form(max_length=100)] = None,
    capacity: Annotated[int | None, Form(gt=0, le=2_147_483_647)] = None,
    price: Annotated[Decimal | None, Form(ge=0, le=Decimal("99999999.99"))] = None,
    available_from: Annotated[str | None, Form()] = None,
    available_to: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> dict[str, object]:
    listing = await lock_owned_listing(listing_id, current_user, db)
    if school is not None and school.strip() != listing.school:
        raise HTTPException(status_code=403, detail="Нельзя изменить учреждение помещения.")
    if await has_active_or_future_bookings(listing_id, db):
        raise HTTPException(status_code=409, detail="Нельзя менять помещение с активными бронями")

    # FastAPI treats blank form fields as missing during conversion. Check
    # presence to distinguish clearing nullable values from leaving them alone.
    fields = await request.form()
    if not fields:
        raise HTTPException(status_code=422, detail="Укажите поля для изменения.")
    if "room" in fields:
        name = (room or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Укажите название помещения.")
        listing.room = name
    if "type_room" in fields:
        if type_room is None:
            raise HTTPException(status_code=422, detail="Укажите тип помещения.")
        listing.type_room = type_room.value
    if "uo" in fields:
        listing.uo = (uo or "").strip()
    if "address" in fields:
        listing.address = (address or "").strip() or None
    if "city" in fields:
        listing.city = (city or "").strip() or None
    if "city_district" in fields:
        listing.city_district = (city_district or "").strip() or None
    if listing.city_district and not listing.city:
        raise HTTPException(status_code=422, detail="Для района укажите город.")
    if "capacity" in fields:
        listing.capacity = capacity
    if "price" in fields:
        if price is None or price != price.quantize(Decimal("0.01")):
            raise HTTPException(status_code=422, detail="Укажите цену с точностью до двух знаков после запятой.")
        listing.price = price
    if "available_from" in fields or "available_to" in fields:
        listing.available_from, listing.available_to = availability_window(
            (available_from or "") if "available_from" in fields else listing.available_from.isoformat(),
            (available_to or "") if "available_to" in fields else listing.available_to.isoformat(),
        )
    if file is not None:
        assign_photo(listing, *await read_photo(file))
    await save_listing(db)
    return listing_response(listing)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_room_listing(
    listing_id: int,
    current_user: Annotated[User, Depends(get_current_school)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    listing = await lock_owned_listing(listing_id, current_user, db, include_archived=True)
    if listing.archived_at is None:
        if await has_active_or_future_bookings(listing_id, db):
            raise HTTPException(status_code=409, detail="Нельзя удалить помещение с активными бронями")
        listing.archived_at = datetime.datetime.now(datetime.UTC)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
