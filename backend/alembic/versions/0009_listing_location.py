"""Store city and city district on listings."""
from alembic import op
import sqlalchemy as sa

revision = "0009_listing_location"
down_revision = "0008_orders_and_listings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("listings", sa.Column("city", sa.String(100)))
    op.add_column("listings", sa.Column("city_district", sa.String(100)))
    op.execute("""
        UPDATE listings
        SET city = 'Минск',
            city_district = CASE school
                WHEN 'ГУО «Средняя школа № 1 г. Минска»' THEN 'Октябрьский'
                WHEN 'ГУО «Средняя школа № 45 г. Минска»' THEN 'Первомайский'
                WHEN 'ГУО «Гимназия № 10 г. Минска»' THEN 'Московский'
                WHEN 'Лицей БГУ' THEN 'Ленинский'
            END
        WHERE owner_id IS NULL AND school IN (
            'ГУО «Средняя школа № 1 г. Минска»',
            'ГУО «Средняя школа № 45 г. Минска»',
            'ГУО «Гимназия № 10 г. Минска»',
            'Лицей БГУ'
        )
    """)


def downgrade() -> None:
    op.drop_column("listings", "city_district")
    op.drop_column("listings", "city")
