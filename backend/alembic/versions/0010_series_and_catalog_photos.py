"""Group weekly reservations, link tenants and store listing images."""
from alembic import op
import sqlalchemy as sa

revision = "0010_series_and_catalog_photos"
down_revision = "0009_listing_location"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("series_group_id", sa.String(32)))
    op.add_column("orders", sa.Column("series_tenant_id", sa.String(64)))
    op.add_column("orders", sa.Column("reservation_id", sa.Integer()))
    op.execute("UPDATE orders SET series_group_id = CAST(id AS VARCHAR(32)) WHERE series_label IS NOT NULL")
    op.create_foreign_key("orders_series_tenant_id_fkey", "orders", "users", ["series_tenant_id"], ["user_id"], ondelete="SET NULL")
    op.create_foreign_key("orders_reservation_id_fkey", "orders", "orders", ["reservation_id"], ["id"], ondelete="SET NULL")
    for column in ("series_group_id", "series_tenant_id", "reservation_id"):
        op.create_index(f"ix_orders_{column}", "orders", [column])
    op.add_column("listings", sa.Column("photo_data", sa.LargeBinary()))
    op.add_column("listings", sa.Column("photo_type", sa.String(32)))


def downgrade() -> None:
    raise RuntimeError("Downgrade would discard client links and listing images.")
