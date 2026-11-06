"""Store password hashes for API accounts."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_user_password_hash"
down_revision: Union[str, None] = "0002_hourly_slots_and_qr"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_table", sa.Column("password_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_table", "password_hash")
