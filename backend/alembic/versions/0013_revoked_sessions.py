"""Persist logout, CAPTCHA challenges and auth limits across workers."""

from alembic import op
import sqlalchemy as sa

revision = "0013_revoked_sessions"
down_revision = "0012_listing_archival"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("listings", sa.Column("photo_sanitized", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        "revoked_sessions",
        sa.Column("token_id", sa.String(32), primary_key=True),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "captcha_challenges",
        sa.Column("challenge_id", sa.String(32), primary_key=True),
        sa.Column("answer_digest", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "auth_rate_limits",
        sa.Column("bucket", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    for table in ("revoked_sessions", "captcha_challenges", "auth_rate_limits"):
        op.create_index(f"ix_{table}_expires_at", table, ["expires_at"])


def downgrade() -> None:
    raise RuntimeError("Downgrade would discard active session revocations and authentication controls.")
