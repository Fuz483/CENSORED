"""Populate the demo catalog with distinct images from the repository."""
import asyncio
from datetime import time
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import select

from api.routers.room_photos import IMAGE_EXTENSIONS, assign_photo, read_legacy_photo, sanitize_photo
from db.database import AsyncSessionLocal
from db.models import RoomListing

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "frontend" / "public" / "photos"

EXISTING = {
    ("ГУО «Средняя школа № 1 г. Минска»", "Спортзал № 1"): "gym-01.jpg",
    ("ГУО «Средняя школа № 1 г. Минска»", "Актовый зал"): "hall-01.jpg",
    ("ГУО «Средняя школа № 45 г. Минска»", "Большой игровой зал"): "gym-02.jpg",
    ("ГУО «Гимназия № 10 г. Минска»", "Кабинет информатики 301"): "it-01.jpg",
    ("ГУО «Гимназия № 10 г. Минска»", "Слесарная мастерская 102"): "class-01.jpg",
    ("Лицей БГУ", "Спортивный зал"): "gym-03.jpg",
    ("Лицей БГУ", "Актовый зал"): "hall-02.jpg",
    ("Лицей БГУ", "Кабинет информатики"): "it-02.jpg",
}

# School names are real. Spaces, photos and availability are illustrative.
SCHOOLS = (
    ("Брест", "Гимназия № 1 г. Бреста имени Защитников Брестской крепости", "Ленинский", (
        ("Зал для командных игр", "sport_hall", 36, "gym-04.jpg"),
        ("Актовый зал со сценой", "assembly_hall", 90, "hall-03.jpg"),
    )),
    ("Витебск", "Гимназия № 1 г. Витебска имени Ж. И. Алфёрова", "Октябрьский", (
        ("Компьютерный класс", "it_lab", 18, "it-03.jpg"),
        ("Учебный бассейн", "pool", 16, "pool-01.jpg"),
    )),
    ("Гомель", "Средняя школа № 38 г. Гомеля", "Советский", (
        ("Большой волейбольный зал", "sport_hall", 40, "gym-05.jpg"),
        ("Мастерская для кружков", "workshop", 14, "class-02.jpg"),
    )),
    ("Гродно", "Гимназия № 1 г. Гродно имени академика Е. Ф. Карского", "Октябрьский", (
        ("Камерный актовый зал", "assembly_hall", 55, "hall-04.jpg"),
        ("Класс робототехники", "it_lab", 16, "it-04.jpg"),
    )),
    ("Могилёв", "Гимназия № 3 г. Могилёва", "Ленинский", (
        ("Бассейн для секций", "pool", 20, "pool-02.jpg"),
        ("Зал общей подготовки", "sport_hall", 28, "gym-06.jpg"),
    )),
    ("Борисов", "Средняя школа № 20 г. Борисова", None, (
        ("Класс цифровых проектов", "it_lab", 20, "it-05.jpg"),
        ("Зал для репетиций", "assembly_hall", 65, "hall-05.jpg"),
    )),
    ("Бобруйск", "Средняя школа № 31 г. Бобруйска", "Первомайский", (
        ("Бассейн для групп", "pool", 18, "pool-03.jpg"),
        ("Творческая мастерская", "workshop", 12, "class-03.jpg"),
    )),
)
RATES = {"sport_hall": 45, "assembly_hall": 60, "it_lab": 35, "workshop": 30, "pool": 50}


def import_existing_photo(listing: RoomListing) -> bool:
    if (listing.image_url or "").startswith("/media/rooms/"):
        source = Path(urlsplit(listing.image_url).path)
        content_type = IMAGE_EXTENSIONS.get(source.suffix.lower())
        if content_type is not None:
            try:
                contents = read_legacy_photo(source.name, content_type)
            except HTTPException:
                pass
            else:
                assign_photo(listing, contents, content_type)
                return True
    asset = EXISTING.get((listing.school, listing.room))
    if asset:
        assign_demo_photo(listing, asset)
        return True
    return False


def assign_demo_photo(listing: RoomListing, asset: str) -> None:
    contents = sanitize_photo((ASSETS / asset).read_bytes(), "image/jpeg")
    assign_photo(listing, contents, "image/jpeg")


async def seed_catalog() -> None:
    async with AsyncSessionLocal() as db:
        listings = (await db.scalars(select(RoomListing))).all()
        by_location = {
            (item.school, item.type_room, item.room): item for item in listings if item.archived_at is None
        }
        archived = {(item.school, item.type_room, item.room) for item in listings if item.archived_at is not None}
        imported = sum(import_existing_photo(item) for item in by_location.values() if item.photo_type is None)
        added = 0
        for city, school, district, rooms in SCHOOLS:
            for room, room_type, capacity, image in rooms:
                key = (school, room_type, room)
                listing = by_location.get(key)
                if listing is None:
                    if key in archived:
                        continue
                    listing = RoomListing(
                        school=school, city=city, city_district=district, type_room=room_type, room=room,
                        capacity=capacity, price=Decimal(RATES[room_type]),
                        available_from=time(14), available_to=time(21),
                    )
                    db.add(listing)
                    await db.flush()
                    added += 1
                if listing.photo_type is None:
                    assign_demo_photo(listing, image)
        await db.commit()
    print(f"Added {added} demo listings. Stored {imported} images for existing listings.")


if __name__ == "__main__":
    asyncio.run(seed_catalog())
