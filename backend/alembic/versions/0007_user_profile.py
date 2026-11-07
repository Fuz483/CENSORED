"""Store optional contact and structured profile fields for users."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_user_profile"
down_revision: Union[str, None] = "0006_user_rooms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_table", sa.Column("surname", sa.String(length=100), nullable=True))
    op.add_column("user_table", sa.Column("first_name", sa.String(length=100), nullable=True))
    op.add_column("user_table", sa.Column("patronymic", sa.String(length=100), nullable=True))
    op.add_column("user_table", sa.Column("email", sa.String(length=254), nullable=True))


def downgrade() -> None:
    op.drop_column("user_table", "email")
    op.drop_column("user_table", "patronymic")
    op.drop_column("user_table", "first_name")
    op.drop_column("user_table", "surname")
