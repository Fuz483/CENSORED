import datetime
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_school
from api.routers.bookings import owned_listing
from db.database import get_db
from db.models import RoomListing, User
from schemas.booking import RoomType

router = APIRouter(prefix="/api/v1/rooms", tags=["Фотографии помещений"])
PHOTO_DIR = Path(__file__).resolve().parents[2] / "uploads" / "room-photos"
MAX_PHOTO_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP"),
}


async def write_photo(file: UploadFile) -> Path:
    image_type = IMAGE_TYPES.get(file.content_type or "")
    if image_type is None:
        raise HTTPException(status_code=415, detail="Поддерживаются фотографии JPG, PNG и WebP.")
    contents = await file.read(MAX_PHOTO_BYTES + 1)
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Размер фотографии не должен превышать 8 МБ.")
    extension, validate_signature = image_type
    if not validate_signature(contents):
        raise HTTPException(status_code=415, detail="Формат файла не соответствует изображению.")

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    destination = PHOTO_DIR / f"{uuid.uuid4().hex}{extension}"
    destination.write_bytes(contents)
    return destination


def assign_photo(listing: RoomListing, destination: Path) -> None:
    listing.image_url = f"/media/rooms/{destination.name}"
    listing.image_updated_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)


def remove_replaced_photo(previous_url: str | None, destination: Path) -> None:
    if previous_url and previous_url.startswith("/media/rooms/"):
        previous_file = PHOTO_DIR / Path(previous_url).name
        if previous_file.parent == PHOTO_DIR and previous_file != destination:
            previous_file.unlink(missing_ok=True)


@router.post("/photo", status_code=status.HTTP_200_OK)
async def save_room_photo(
    school: str = Form(..., min_length=2, max_length=255),
    type_room: RoomType = Form(...),
    room: str = Form(..., min_length=1, max_length=128),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_school),
    db: AsyncSession = Depends(get_db),
):
    """Save an authenticated institution's room image on persistent backend storage."""
    if school.strip() != current_user.name:
        raise HTTPException(status_code=403, detail="Можно менять фото только помещений своего учреждения.")

    listing = await db.scalar(owned_listing(current_user).where(
        RoomListing.type_room == type_room.value, RoomListing.room == room.strip(),
    ).with_for_update())
    if listing is None:
        raise HTTPException(status_code=404, detail="Помещение не найдено в каталоге.")

    destination = await write_photo(file)
    previous_url = listing.image_url
    assign_photo(listing, destination)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        destination.unlink(missing_ok=True)
        raise
    remove_replaced_photo(previous_url, destination)
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
    db.add(listing)
    destination = None
    try:
        await db.flush()
        destination = await write_photo(file)
        assign_photo(listing, destination)
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        if destination is not None:
            destination.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="Помещение с таким названием уже есть в каталоге.") from error
    except Exception:
        await db.rollback()
        if destination is not None:
            destination.unlink(missing_ok=True)
        raise
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
