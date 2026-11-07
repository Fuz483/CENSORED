import asyncio
import datetime
from decimal import Decimal
from sqlalchemy import select
from db.database import AsyncSessionLocal, Base, engine
from db.models import Booking, RoomListing, User


async def seed_database() -> None:
    """Первичное наполнение базы данных с поддержкой почасовых слотов и QR-пропусков."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        existing_user = (await session.execute(select(User).limit(1))).scalar_one_or_none()
        if existing_user is not None:
            return

        users = [
            User(
                user_id="USR-TENANT-001",
                name="Иванов Алексей Петрович",
                phone="+375291112233",
                passport_id="MP1234567",
                role="tenant",
                rating=4.9,
            ),
            User(
                user_id="USR-ADMIN-001",
                name="Смирнова Елена Викторовна",
                phone="+375292223344",
                passport_id="MP7654321",
                role="admin",
                rating=5.0,
            ),
            User(
                user_id="USR-INSPECTOR-001",
                name="Козлов Дмитрий Сергеевич",
                phone="+375293334455",
                passport_id="MP1122334",
                role="inspector",
                rating=5.0,
            ),
            User(
                user_id="USR-GUARD-001",
                name="Новиков Сергей Николаевич",
                phone="+375294445566",
                passport_id="MP9988776",
                role="guard",
                rating=4.8,
            ),
        ]
        session.add_all(users)
        await session.flush()

        today = datetime.date.today()
        listing_id = await session.scalar(select(RoomListing.id).where(
            RoomListing.school == "ГУО «Средняя школа № 1 г. Минска»",
            RoomListing.type_room == "sport_hall",
            RoomListing.room == "Спортзал № 1",
        ))
        if listing_id is None:
            raise RuntimeError("Apply database migrations before seeding demo orders.")
        initial_bookings = [
            Booking(
                listing_id=listing_id,
                school="ГУО «Средняя школа № 1 г. Минска»",
                type_room="sport_hall",
                room="Спортзал № 1",
                date=today,
                start_time=datetime.time(18, 0),
                end_time=datetime.time(19, 0),
                price=Decimal("45.00"),
                state="confirmed",
                user_id="USR-TENANT-001",
            ),
            Booking(
                listing_id=listing_id,
                school="ГУО «Средняя школа № 1 г. Минска»",
                type_room="sport_hall",
                room="Спортзал № 1",
                date=today,
                start_time=datetime.time(19, 0),
                end_time=datetime.time(20, 0),
                price=Decimal("45.00"),
                state="confirmed",
                user_id="USR-TENANT-001",
            ),
        ]
        session.add_all(initial_bookings)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed_database())
