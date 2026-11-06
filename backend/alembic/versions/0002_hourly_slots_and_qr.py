"""Add passport_id, hourly slot fields (end_time, price) and QR code

Revision ID: 0002_hourly_slots_and_qr
Revises:
Create Date: 2026-11-06 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_hourly_slots_and_qr"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. Создание или обновление таблицы user_table
    if "user_table" not in existing_tables:
        op.create_table(
            "user_table",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("phone", sa.String(length=32), nullable=False),
            sa.Column("passport_id", sa.String(length=64), nullable=True),
            sa.Column("role", sa.String(length=32), nullable=False),
            sa.Column("rating", sa.Float(), nullable=False, server_default="5.0"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", name="uq_user_table_user_id"),
        )
        op.create_index("ix_user_table_user_id", "user_table", ["user_id"], unique=True)
    else:
        user_columns = {col["name"] for col in inspector.get_columns("user_table")}
        if "passport_id" not in user_columns:
            op.add_column("user_table", sa.Column("passport_id", sa.String(length=64), nullable=True))

        unique_constraints = {uc["name"] for uc in inspector.get_unique_constraints("user_table")}
        indexes = {idx["name"] for idx in inspector.get_indexes("user_table")}
        if "uq_user_table_user_id" not in unique_constraints and "ix_user_table_user_id" not in indexes:
            op.create_unique_constraint("uq_user_table_user_id", "user_table", ["user_id"])

    # 2. Создание или обновление таблицы booking_table
    if "booking_table" not in existing_tables:
        op.create_table(
            "booking_table",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("school", sa.String(length=255), nullable=False),
            sa.Column("type_room", sa.String(length=64), nullable=False),
            sa.Column("room", sa.String(length=128), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("start_time", sa.Time(), nullable=False),
            sa.Column("end_time", sa.Time(), nullable=False),
            sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column("state", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("code", sa.String(length=64), nullable=True),
            sa.Column("user_id", sa.String(length=64), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user_table.user_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("room", "date", "start_time", name="uq_room_date_start_time"),
        )
        op.create_index("ix_booking_table_type_room", "booking_table", ["type_room"], unique=False)
        op.create_index("ix_booking_table_room", "booking_table", ["room"], unique=False)
        op.create_index("ix_booking_table_date", "booking_table", ["date"], unique=False)
        op.create_index("ix_booking_table_code", "booking_table", ["code"], unique=False)
        op.create_index("ix_booking_table_user_id", "booking_table", ["user_id"], unique=False)
    else:
        booking_columns = {col["name"] for col in inspector.get_columns("booking_table")}
        if "end_time" not in booking_columns:
            op.add_column(
                "booking_table",
                sa.Column("end_time", sa.Time(), nullable=False, server_default=sa.text("'19:00:00'")),
            )
            op.execute("UPDATE booking_table SET end_time = start_time + interval '1 hour'")
            op.alter_column("booking_table", "end_time", server_default=None)

        if "price" not in booking_columns:
            op.add_column(
                "booking_table",
                sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="45.00"),
            )
            op.alter_column("booking_table", "price", server_default=None)

        if "code" not in booking_columns:
            op.add_column("booking_table", sa.Column("code", sa.String(length=64), nullable=True))
            op.create_index("ix_booking_table_code", "booking_table", ["code"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_booking_table_code", table_name="booking_table")
    op.drop_column("booking_table", "code")
    op.drop_column("booking_table", "price")
    op.drop_column("booking_table", "end_time")
    op.drop_column("user_table", "passport_id")