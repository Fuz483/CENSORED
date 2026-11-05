import asyncio
import datetime
from sqlalchemy import select
from db.database import AsyncSessionLocal, Base, engine
from db.models import Booking, User


async def seed_database() -> None:
    """
    Гарантированное создание таблиц (при отсутствии ревизий Alembic)
    и первичное наполнение базы данных базовыми пользователями и учебными заведениями.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Проверка наличия записей в таблице пользователей
        existing_user = (await session.execute(select(User).limit(1))).scalar_one_or_none()
        if existing_user is not None:
            return

        # 1. Инициализация базовых пользователей всех ролей
        users = [
            User(
                user_id="USR-TENANT-001",
                name="Иванов Алексей Петрович",
                phone="+375291112233",
                role="tenant",
                rating=4.9,
            ),
            User(
                user_id="USR-ADMIN-001",
                name="Смирнова Елена Викторовна",
                phone="+375292223344",
                role="admin",
                rating=5.0,
            ),
            User(
                user_id="USR-INSPECTOR-001",
                name="Козлов Дмитрий Сергеевич",
                phone="+375293334455",
                role="inspector",
                rating=5.0,
            ),
            User(
                user_id="USR-GUARD-001",
                name="Новиков Сергей Николаевич",
                phone="+375294445566",
                role="guard",
                rating=4.8,
            ),
        ]
        session.add_all(users)
        await session.flush()

        # 2. Инициализация демонстрационных записей по базовым учебным заведениям
        today = datetime.date.today()
        initial_bookings = [
            Booking(
                school="ГУО «Средняя школа № 1 г. Минска»",
                type_room="sport_hall",
                room="Спортзал № 1",
                date=today,
                start_time=datetime.time(18, 0),
                state="confirmed",
                user_id="USR-TENANT-001",
            ),
            Booking(
                school="ГУО «Гимназия № 10 г. Минска»",
                type_room="it_lab",
                room="Кабинет информатики 301",
                date=today,
                start_time=datetime.time(19, 0),
                state="pending",
                user_id="USR-TENANT-001",
            ),
        ]
        session.add_all(initial_bookings)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed_database())