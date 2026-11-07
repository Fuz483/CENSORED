"""Record erasure requests and preserve the identity tied to issued passes."""
from alembic import op
import sqlalchemy as sa

revision = "0015_privacy_controls"
down_revision = "0014_catalog_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("erasure_requested_at", sa.DateTime(timezone=True)))
    op.add_column("orders", sa.Column("visitor_name", sa.String(255)))
    op.add_column("orders", sa.Column("visitor_phone", sa.String(32)))
    op.execute("""
        UPDATE orders AS booking
        SET visitor_name = COALESCE(
                NULLIF(left(split_part(split_part(booking.agreement_text, chr(10) || 'Арендатор: ', 2), chr(10), 1), 255), ''),
                account.name
            ),
            visitor_phone = account.phone
        FROM users AS account
        WHERE booking.user_id = account.user_id AND booking.code IS NOT NULL
          AND booking.series_label IS NULL
    """)


def downgrade() -> None:
    raise RuntimeError("Downgrade would discard erasure requests and booking contact snapshots.")
