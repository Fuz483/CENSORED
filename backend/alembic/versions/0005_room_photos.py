"""Persist photos for rooms in the public rental catalog."""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_room_photos"
down_revision: Union[str, None] = "0004_booking_rebooking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROOM_IMAGES = {
    "sport_hall": "https://images.pexels.com/photos/7201151/pexels-photo-7201151.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "assembly_hall": "https://images.pexels.com/photos/5506053/pexels-photo-5506053.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "it_lab": "https://images.pexels.com/photos/18471531/pexels-photo-18471531.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "workshop": "https://images.pexels.com/photos/36388551/pexels-photo-36388551.jpeg?auto=compress&cs=tinysrgb&w=1200",
    "pool": "https://images.pexels.com/photos/7430320/pexels-photo-7430320.jpeg?auto=compress&cs=tinysrgb&w=1200",
}


def upgrade() -> None:
    op.create_table(
        "room_photo_table",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("school", sa.String(length=255), nullable=False),
        sa.Column("type_room", sa.String(length=64), nullable=False),
        sa.Column("room", sa.String(length=128), nullable=False),
        sa.Column("image_url", sa.String(length=512), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("school", "type_room", "room", name="uq_room_photo_location"),
    )

    connection = op.get_bind()
    seeded_rooms = {
        ("ГУО «Средняя школа № 1 г. Минска»", "sport_hall", "Спортзал № 1"),
        ("ГУО «Средняя школа № 1 г. Минска»", "assembly_hall", "Актовый зал"),
        ("ГУО «Гимназия № 10 г. Минска»", "it_lab", "Кабинет информатики 301"),
        ("ГУО «Гимназия № 10 г. Минска»", "workshop", "Слесарная мастерская 102"),
        ("ГУО «Средняя школа № 45 г. Минска»", "sport_hall", "Большой игровой зал"),
        ("Лицей БГУ", "sport_hall", "Спортивный зал"),
        ("Лицей БГУ", "assembly_hall", "Актовый зал"),
        ("Лицей БГУ", "it_lab", "Кабинет информатики"),
    }
    if "booking_table" in sa.inspect(connection).get_table_names():
        seeded_rooms.update(
            (row.school, row.type_room, row.room)
            for row in connection.execute(sa.text(
                "SELECT DISTINCT school, type_room, room FROM booking_table"
            ))
            if row.type_room in ROOM_IMAGES
        )

    if seeded_rooms:
        photo_table = sa.table(
            "room_photo_table",
            sa.column("school", sa.String()),
            sa.column("type_room", sa.String()),
            sa.column("room", sa.String()),
            sa.column("image_url", sa.String()),
            sa.column("updated_at", sa.DateTime()),
        )
        op.bulk_insert(photo_table, [
            {
                "school": school,
                "type_room": room_type,
                "room": room,
                "image_url": ROOM_IMAGES[room_type],
                "updated_at": datetime.utcnow(),
            }
            for school, room_type, room in sorted(seeded_rooms)
            if room_type in ROOM_IMAGES
        ])


def downgrade() -> None:
    op.drop_table("room_photo_table")
