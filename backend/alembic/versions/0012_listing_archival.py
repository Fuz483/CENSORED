"""Archive catalog listings without dropping historical orders."""
from alembic import op
import sqlalchemy as sa

revision = "0012_listing_archival"
down_revision = "0011_series_dates_and_schools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("listings", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.drop_constraint("uq_room_listing_location", "listings", type_="unique")
    op.create_index(
        "uq_room_listing_location", "listings", ["school", "type_room", "room"],
        unique=True, postgresql_where=sa.text("archived_at IS NULL"),
    )


def downgrade() -> None:
    raise RuntimeError("Downgrade would republish archived listings and may create duplicate rooms.")
