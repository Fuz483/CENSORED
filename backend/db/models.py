import datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import (
    Date,
    DateTime,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    Index,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db.database import Base


class User(Base):
    """Модель пользователя платформы."""

    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_registered_tenant_phone", "phone", unique=True,
            postgresql_where=text("role = 'tenant' AND password_hash IS NOT NULL AND legacy_phone IS NULL"),
            sqlite_where=text("role = 'tenant' AND password_hash IS NOT NULL AND legacy_phone IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), nullable=False)
    legacy_phone: Mapped[Optional[str]] = mapped_column(String(32))
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
        foreign_keys="Booking.user_id",
    )


class Booking(Base):
    """Разовый заказ арендатора или еженедельный резерв школы."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), index=True)
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
        ForeignKey("users.user_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    series_label: Mapped[Optional[str]] = mapped_column(String(120))
    series_group_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    series_ends_on: Mapped[Optional[datetime.date]] = mapped_column(Date)
    series_tenant_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), index=True,
    )
    reservation_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), index=True,
    )
    cancelled_by_school: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    agreement_version: Mapped[Optional[str]] = mapped_column(String(32))
    agreement_text: Mapped[Optional[str]] = mapped_column(Text)
    agreement_accepted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship("User", back_populates="bookings", foreign_keys=[user_id])


class RoomListing(Base):
    """A room published in the rental catalog by its owning institution."""

    __tablename__ = "listings"
    __table_args__ = (
        Index(
            "uq_room_listing_location", "school", "type_room", "room", unique=True,
            postgresql_where=text("archived_at IS NULL"),
            sqlite_where=text("archived_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("users.user_id", ondelete="SET NULL"), index=True
    )
    school: Mapped[str] = mapped_column(String(255), nullable=False)
    uo: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    type_room: Mapped[str] = mapped_column(String(64), nullable=False)
    room: Mapped[str] = mapped_column(String(128), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(512))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    city_district: Mapped[Optional[str]] = mapped_column(String(100))
    capacity: Mapped[Optional[int]] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    available_from: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    available_to: Mapped[datetime.time] = mapped_column(Time, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(512))
    image_updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    photo_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, deferred=True)
    photo_type: Mapped[Optional[str]] = mapped_column(String(32))
    archived_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True))
