"""Bound recurring schedules, standardize phones and use real school names."""
from collections import Counter

from alembic import op
import sqlalchemy as sa

from core.phones import normalize_phone

revision = "0011_series_dates_and_schools"
down_revision = "0010_series_and_catalog_photos"
branch_labels = None
depends_on = None

SCHOOLS = {
    "Брест": "Гимназия № 1 г. Бреста имени Защитников Брестской крепости",
    "Витебск": "Гимназия № 1 г. Витебска имени Ж. И. Алфёрова",
    "Гомель": "Средняя школа № 38 г. Гомеля",
    "Гродно": "Гимназия № 1 г. Гродно имени академика Е. Ф. Карского",
    "Могилёв": "Гимназия № 3 г. Могилёва",
    "Борисов": "Средняя школа № 20 г. Борисова",
    "Бобруйск": "Средняя школа № 31 г. Бобруйска",
}


def upgrade() -> None:
    op.add_column("orders", sa.Column("series_ends_on", sa.Date()))
    op.add_column("orders", sa.Column("cancelled_by_school", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("legacy_phone", sa.String(32)))

    connection = op.get_bind()
    users = connection.execute(sa.text("""
        SELECT id, phone, role = 'tenant' AND password_hash IS NOT NULL AS registered FROM users WHERE phone <> ''
    """)).all()
    normalized = [(user, normalize_phone(user.phone)) for user in users]
    counts = Counter(phone for user, phone in normalized if user.registered)
    for user, phone in normalized:
        alias = user.phone.strip() if user.registered and counts[phone] > 1 else None
        connection.execute(sa.text("UPDATE users SET phone = :phone, legacy_phone = :alias WHERE id = :id"),
                           {"phone": phone, "alias": alias, "id": user.id})
    op.create_index(
        "uq_registered_tenant_phone", "users", ["phone"], unique=True,
        postgresql_where=sa.text("role = 'tenant' AND password_hash IS NOT NULL AND legacy_phone IS NULL"),
    )

    for city, school in SCHOOLS.items():
        values = {"old": f"Демо-школа · {city}", "school": school}
        # A manually registered school may already use this room name. Keep
        # the ambiguous legacy listing and its orders under their original name.
        connection.execute(sa.text("""
            UPDATE listings AS legacy SET school = :school
            WHERE legacy.school = :old
              AND NOT EXISTS (
                  SELECT 1 FROM listings AS canonical
                  WHERE canonical.school = :school
                    AND canonical.type_room = legacy.type_room
                    AND canonical.room = legacy.room
              )
        """), values)
        connection.execute(sa.text("""
            UPDATE orders AS o SET school = :school
            FROM listings AS l
            WHERE o.listing_id = l.id AND o.school = :old AND l.school = :school
        """), values)


def downgrade() -> None:
    raise RuntimeError("Downgrade would discard series end dates and school cancellation data.")
