import datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.database import Base


class User(Base):
    """Модель пользователя платформы (user_table)."""

    __tablename__ = "user_table"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    surname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    patronymic: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    passport_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)

    bookings: Mapped[List["Booking"]] = relationship(
        "Booking",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Booking(Base):
    """Модель почасового слота бронирования помещения (booking_table)."""

    __tablename__ = "booking_table"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    type_room: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    room: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    date: Mapped[datetime.date] = mapped_column(Date, index=True, nullable=False)
    start_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    end_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("user_table.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="bookings")


class RoomPhoto(Base):
    """Persistent photo assigned to a room in the public rental catalog."""

    __tablename__ = "room_photo_table"
    __table_args__ = (
        UniqueConstraint("school", "type_room", "room", name="uq_room_photo_location"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    type_room: Mapped[str] = mapped_column(String(64), nullable=False)
    room: Mapped[str] = mapped_column(String(128), nullable=False)
    image_url: Mapped[str] = mapped_column(String(512), nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False
    )


class RoomListing(Base):
    """A room published in the rental catalog by its owning institution."""

    __tablename__ = "room_listing_table"
    __table_args__ = (
        UniqueConstraint("school", "type_room", "room", name="uq_room_listing_location"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("user_table.user_id", ondelete="CASCADE"), index=True, nullable=False
    )
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    uo: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    type_room: Mapped[str] = mapped_column(String(64), nullable=False)
    room: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[str] = mapped_column(String(512), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    available_from: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    available_to: Mapped[datetime.time] = mapped_column(Time, nullable=False)
