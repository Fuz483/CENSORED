from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import User, Booking
from schemas import UserCreate, UserRead, BookingCreate, BookingRead, BookingState


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Автоматическое создание таблиц в БД при запуске приложения
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="SmartSpace ОСиПТО Backend API",
    description="REST API для управления пользователями, объектами школ и бронированием слотов.",
    version="1.0.0",
    lifespan=lifespan
)


# ---------------------------------------------------------------------------
# Маршрутизаторы пользователей (Users)
# ---------------------------------------------------------------------------

@app.post(
    "/users",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Users"],
    summary="Создание нового пользователя"
)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)) -> User:
    # Проверка уникальности user_id
    existing_user = db.scalar(select(User).where(User.user_id == user_in.user_id))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Пользователь с user_id '{user_in.user_id}' уже существует."
        )

    new_user = User(**user_in.model_dump())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get(
    "/users",
    response_model=List[UserRead],
    tags=["Users"],
    summary="Получение списка пользователей"
)
def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
) -> List[User]:
    stmt = select(User).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())


# ---------------------------------------------------------------------------
# Маршрутизаторы бронирований (Bookings)
# ---------------------------------------------------------------------------

@app.post(
    "/bookings",
    response_model=BookingRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Bookings"],
    summary="Создание нового бронирования"
)
def create_booking(booking_in: BookingCreate, db: Session = Depends(get_db)) -> Booking:
    # 1. Проверка существования пользователя (ссылочная целостность ForeignKey)
    user = db.scalar(select(User).where(User.user_id == booking_in.user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь с user_id '{booking_in.user_id}' не найден."
        )

    # 2. Бизнес-правило Safety Tiers: запрет прямой аренды Red Tier без участия штатного мастера/администратора
    if booking_in.type_room.lower() == "red" and user.role.lower() not in ("master", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Объекты Red Tier запрещены для прямого бронирования без закрепленного штатного мастера (role='master')."
        )

    # 3. Проверка на временные коллизии (доступен ли выбранный слот в указанной школе и кабинете)
    collision_stmt = select(Booking).where(
        and_(
            Booking.school == booking_in.school,
            Booking.room == booking_in.room,
            Booking.date == booking_in.date,
            Booking.start_time == booking_in.start_time,
            Booking.state != "rejected"
        )
    )
    existing_booking = db.scalar(collision_stmt)
    if existing_booking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Выбранное время для данного помещения уже занято."
        )

    # 4. Сохранение заявки на бронирование.
    # Статус задается сервером: новая заявка всегда ожидает согласования школой.
    new_booking = Booking(**booking_in.model_dump(), state="pending")
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)
    return new_booking


@app.get(
    "/bookings",
    response_model=List[BookingRead],
    tags=["Bookings"],
    summary="Извлечение списка бронирований"
)
def get_bookings(
    school: Optional[str] = Query(None, description="Фильтр по школе"),
    user_id: Optional[str] = Query(None, description="Фильтр по ID пользователя"),
    state: Optional[BookingState] = Query(None, description="Фильтр по статусу бронирования"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
) -> List[Booking]:
    stmt = select(Booking)

    if school:
        stmt = stmt.where(Booking.school == school)
    if user_id:
        stmt = stmt.where(Booking.user_id == user_id)
    if state:
        stmt = stmt.where(Booking.state == state)

    stmt = stmt.order_by(Booking.date.desc(), Booking.start_time.asc()).offset(skip).limit(limit)
    return list(db.scalars(stmt).all())