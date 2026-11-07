"""Index recurring availability and ordered booking history."""

import sqlalchemy as sa
from alembic import op

revision = "0014_catalog_indexes"
down_revision = "0013_revoked_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_orders_recurring_listing_date", "orders", ["listing_id", "date"],
        postgresql_where=sa.text("series_label IS NOT NULL"),
    )
    op.create_index(
        "ix_orders_tenant_history", "orders", ["user_id", "date", "start_time", "id"],
        postgresql_where=sa.text("series_label IS NULL"),
    )
    op.create_index(
        "ix_orders_listing_history", "orders", ["listing_id", "date", "start_time", "id"],
        postgresql_where=sa.text("series_label IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_orders_listing_history", table_name="orders")
    op.drop_index("ix_orders_tenant_history", table_name="orders")
    op.drop_index("ix_orders_recurring_listing_date", table_name="orders")
