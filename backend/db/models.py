import datetime
from typing import List
from sqlalchemy import (
    Date,
    Float,
    ForeignKey,
    Integer,
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
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)

    bookings: Mapped[List["Booking"]] = relationship(
        "Booking",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Booking(Base):
    """Модель бронирования помещения (booking_table)."""

    __tablename__ = "booking_table"
    __table_args__ = (
        UniqueConstraint("room", "date", "start_time", name="uq_room_date_start_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    type_room: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    room: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    date: Mapped[datetime.date] = mapped_column(Date, index=True, nullable=False)
    start_time: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    user_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("user_table.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="bookings")