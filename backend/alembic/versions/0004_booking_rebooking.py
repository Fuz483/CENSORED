"""Allow booking a cancelled interval again; overlap checks live in the API."""
from alembic import op

revision = "0004_booking_rebooking"
down_revision = "0003_user_password_hash"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_room_date_start_time", "booking_table", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_room_date_start_time", "booking_table", ["room", "date", "start_time"])
