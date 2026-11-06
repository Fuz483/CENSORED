import datetime
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user
from api.routers.bookings import SCHOOL_ROOMS_CATALOG
from core.config import settings
from core.uo_demo import UO_DEMO_SCHOOL
from db.database import get_db
from db.models import Booking, RoomListing, RoomPhoto, User
from schemas.booking import RoomType

router = APIRouter(prefix="/api/v1/rooms", tags=["Фотографии помещений"])
PHOTO_DIR = Path(__file__).resolve().parents[2] / "uploads" / "room-photos"
MAX_PHOTO_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP"),
}


async def persist_room_photo(school: str, type_room: RoomType, room: str, file: UploadFile, db: AsyncSession):
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
    image_url = f"/media/rooms/{destination.name}"
    photo = (await db.execute(select(RoomPhoto).where(
        RoomPhoto.school == school,
        RoomPhoto.type_room == type_room.value,
        RoomPhoto.room == room,
    ))).scalar_one_or_none()
    previous_url = photo.image_url if photo is not None else None
    if photo is None:
        db.add(RoomPhoto(school=school, type_room=type_room.value, room=room, image_url=image_url))
    else:
        photo.image_url = image_url
    return image_url, destination, previous_url


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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save an authenticated institution's room image on persistent backend storage."""
    if current_user.role != "master" or school.strip() != current_user.name:
        raise HTTPException(status_code=403, detail="Можно менять фото только помещений своего учреждения.")

    room_exists = any(
        entry["school"] == school and entry["type_room"] == type_room.value and entry["room"] == room
        for entry in SCHOOL_ROOMS_CATALOG
    )
    if settings.UO_DEMO_ENABLED and school == UO_DEMO_SCHOOL and (type_room.value, room) in {
        ("sport_hall", "Спортивный зал"),
        ("assembly_hall", "Актовый зал"),
        ("it_lab", "Кабинет информатики"),
    }:
        room_exists = True
    if not room_exists:
        room_exists = (await db.execute(select(RoomListing.id).where(
            RoomListing.school == school,
            RoomListing.type_room == type_room.value,
            RoomListing.room == room,
        ).limit(1))).scalar_one_or_none() is not None
    if not room_exists:
        room_exists = (await db.execute(
            select(Booking.id).where(
                Booking.school == school,
                Booking.type_room == type_room.value,
                Booking.room == room,
            ).limit(1)
        )).scalar_one_or_none() is not None
    if not room_exists:
        raise HTTPException(status_code=404, detail="Помещение не найдено в каталоге.")

    image_url, destination, previous_url = await persist_room_photo(school, type_room, room, file, db)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        destination.unlink(missing_ok=True)
        raise
    remove_replaced_photo(previous_url, destination)
    return {"school": school, "type_room": type_room.value, "room": room, "image_url": image_url}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_room_listing(
    school: str = Form(..., min_length=2, max_length=255),
    uo: str = Form("", max_length=255),
    type_room: RoomType = Form(...),
    room: str = Form(..., min_length=1, max_length=128),
    address: str = Form(..., min_length=1, max_length=512),
    capacity: int = Form(..., gt=0),
    price: float = Form(..., gt=0),
    available_from: str = Form(...),
    available_to: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish a new room with its first photo for the authenticated institution."""
    if current_user.role != "master" or school.strip() != current_user.name:
        raise HTTPException(status_code=403, detail="Можно добавлять помещения только своего учреждения.")
    try:
        start = datetime.time.fromisoformat(available_from)
        end = datetime.time.fromisoformat(available_to)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Проверьте время доступности помещения.") from error
    if (start.second or start.minute % 15 or end.second or end.minute % 15 or
            start < datetime.time(14) or end > datetime.time(21) or
            start >= end or (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute) < 60):
        raise HTTPException(status_code=422, detail="Укажите доступность с шагом 15 минут в диапазоне 14:00–21:00.")

    school = school.strip()
    room = room.strip()
    existing = (await db.execute(select(RoomListing.id).where(
        RoomListing.school == school,
        RoomListing.type_room == type_room.value,
        RoomListing.room == room,
    ).limit(1))).scalar_one_or_none()
    reserved_room = any(
        entry["school"] == school and entry["type_room"] == type_room.value and entry["room"] == room
        for entry in SCHOOL_ROOMS_CATALOG
    )
    if settings.UO_DEMO_ENABLED and school == UO_DEMO_SCHOOL and (type_room.value, room) in {
        ("sport_hall", "Спортивный зал"),
        ("assembly_hall", "Актовый зал"),
        ("it_lab", "Кабинет информатики"),
    }:
        reserved_room = True
    if not reserved_room:
        reserved_room = (await db.execute(select(Booking.id).where(
            Booking.school == school,
            Booking.type_room == type_room.value,
            Booking.room == room,
        ).limit(1))).scalar_one_or_none() is not None
    if reserved_room:
        raise HTTPException(status_code=409, detail="Помещение с таким названием уже есть в каталоге.")
    if existing is not None:
        raise HTTPException(status_code=409, detail="Помещение с таким названием уже есть в каталоге.")

    listing = RoomListing(
        owner_id=current_user.user_id,
        school=school,
        uo=uo.strip(),
        type_room=type_room.value,
        room=room,
        address=address.strip(),
        capacity=capacity,
        price=price,
        available_from=start,
        available_to=end,
    )
    db.add(listing)
    destination = None
    try:
        await db.flush()
        image_url, destination, _ = await persist_room_photo(school, type_room, room, file, db)
        await db.commit()
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
        "capacity": listing.capacity,
        "price": listing.price,
        "available_from": listing.available_from,
        "available_to": listing.available_to,
        "image_url": image_url,
    }
