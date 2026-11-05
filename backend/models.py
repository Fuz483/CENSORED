from datetime import date, time
from typing import List
from sqlalchemy import Integer, String, Float, Date, Time, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "user_table"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)

    # Связь один-ко-многим с бронированиями
    bookings: Mapped[List["Booking"]] = relationship(
        "Booking",
        back_populates="user",
        cascade="all, delete-orphan"
    )


class Booking(Base):
    __tablename__ = "booking_table"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    school: Mapped[str] = mapped_column(String, nullable=False, index=True)
    type_room: Mapped[str] = mapped_column(String, nullable=False)  # Отражает категорию помещения / Safety Tier (green, yellow, red)
    room: Mapped[str] = mapped_column(String, nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    state: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("user_table.user_id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
        index=True
    )

    # Обратная связь с пользователем
    user: Mapped["User"] = relationship("User", back_populates="bookings")