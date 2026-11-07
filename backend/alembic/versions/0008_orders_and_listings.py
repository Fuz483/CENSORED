"""Consolidate the catalog and link historical orders to listings."""

from alembic import op
import sqlalchemy as sa

revision = "0008_orders_and_listings"
down_revision = "0007_user_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("user_table", "users")
    op.rename_table("booking_table", "orders")
    op.rename_table("room_listing_table", "listings")

    op.drop_constraint("room_listing_table_owner_id_fkey", "listings", type_="foreignkey")
    op.create_foreign_key("listings_owner_id_fkey", "listings", "users", ["owner_id"], ["user_id"], ondelete="SET NULL")
    for column in ("owner_id", "address", "capacity"):
        op.alter_column("listings", column, nullable=True)
    op.add_column("listings", sa.Column("image_url", sa.String(512)))
    op.add_column("listings", sa.Column("image_updated_at", sa.DateTime()))

    # Old releases represented demo and historical rooms only in photos or bookings.
    op.execute("""
        INSERT INTO listings (school, type_room, room, uo, capacity, price, available_from, available_to)
        SELECT school, type_room, room, '',
               CASE room WHEN 'Спортзал № 1' THEN 60 WHEN 'Большой игровой зал' THEN 60
                         WHEN 'Актовый зал' THEN CASE WHEN school LIKE 'ГУО%' THEN 120 END
                         WHEN 'Кабинет информатики 301' THEN 18 WHEN 'Слесарная мастерская 102' THEN 30 END,
               CASE type_room WHEN 'sport_hall' THEN 45 WHEN 'assembly_hall' THEN 60
                              WHEN 'it_lab' THEN 35 WHEN 'workshop' THEN 30 WHEN 'pool' THEN 50 ELSE 0 END,
               TIME '14:00', TIME '21:00'
        FROM (
            SELECT school, type_room, room FROM room_photo_table
            UNION
            SELECT school, type_room, room FROM orders
        ) AS locations
        ON CONFLICT (school, type_room, room) DO NOTHING
    """)
    op.execute("""
        UPDATE listings AS l
        SET image_url = p.image_url, image_updated_at = p.updated_at
        FROM room_photo_table AS p
        WHERE (l.school, l.type_room, l.room) = (p.school, p.type_room, p.room)
    """)
    op.drop_table("room_photo_table")

    op.add_column("orders", sa.Column("listing_id", sa.Integer()))
    op.execute("""
        UPDATE orders AS o SET listing_id = l.id
        FROM listings AS l WHERE (o.school, o.type_room, o.room) = (l.school, l.type_room, l.room)
    """)
    op.alter_column("orders", "listing_id", nullable=False)
    op.create_foreign_key("orders_listing_id_fkey", "orders", "listings", ["listing_id"], ["id"])
    op.create_index("ix_orders_listing_id", "orders", ["listing_id"])
    op.add_column("orders", sa.Column("series_label", sa.String(120)))
    op.add_column("orders", sa.Column("agreement_version", sa.String(32)))
    op.add_column("orders", sa.Column("agreement_text", sa.Text()))
    op.add_column("orders", sa.Column("agreement_accepted_at", sa.DateTime(timezone=True)))

    for table, old, columns in (
        ("users", "user_table", ("user_id",)),
        ("orders", "booking_table", ("type_room", "room", "date", "code", "user_id")),
        ("listings", "room_listing_table", ("owner_id",)),
    ):
        for column in columns:
            op.execute(f"ALTER INDEX ix_{old}_{column} RENAME TO ix_{table}_{column}")


def downgrade() -> None:
    raise RuntimeError("Downgrade would discard recurring reservations and accepted agreements.")
