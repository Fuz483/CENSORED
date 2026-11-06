"""Persist institution-created rooms in the rental catalog."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_user_rooms"
down_revision: Union[str, None] = "0005_room_photos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "room_listing_table",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.String(length=64), nullable=False),
        sa.Column("school", sa.String(length=255), nullable=False),
        sa.Column("uo", sa.String(length=255), nullable=False),
        sa.Column("type_room", sa.String(length=64), nullable=False),
        sa.Column("room", sa.String(length=128), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("available_from", sa.Time(), nullable=False),
        sa.Column("available_to", sa.Time(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user_table.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school", "type_room", "room", name="uq_room_listing_location"),
    )
    op.create_index("ix_room_listing_table_owner_id", "room_listing_table", ["owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_room_listing_table_owner_id", table_name="room_listing_table")
    op.drop_table("room_listing_table")
