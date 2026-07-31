"""catalog sectors brands products skus

Revision ID: f1a9c3d7b2e4
Revises: a3f7e2d9b5c1
Create Date: 2026-07-30 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f1a9c3d7b2e4'
down_revision: Union[str, None] = 'a3f7e2d9b5c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SECTOR_NAMES = [
    "Retail", "Alimentos y Bebidas", "Cuidado Personal", "Ferretería",
    "Farmacia", "Tecnología", "Textil y Moda", "Automotriz", "Servicios", "Otro",
]


def upgrade() -> None:
    # 1. sectors (catálogo global, sin dependencias externas)
    op.create_table(
        'sectors',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.UniqueConstraint('name', name='uq_sectors_name'),
    )

    sectors_table = sa.table(
        'sectors',
        sa.column('id', postgresql.UUID(as_uuid=True)),
        sa.column('name', sa.String),
    )
    op.bulk_insert(sectors_table, [{'id': uuid.uuid4(), 'name': name} for name in SECTOR_NAMES])

    # 2. tenants.sector_id (depende de sectors)
    op.add_column('tenants', sa.Column('sector_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_tenants_sector_id', 'tenants', 'sectors', ['sector_id'], ['id'], ondelete='SET NULL',
    )

    # 3. brands (depende de tenants)
    op.create_table(
        'brands',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('logo_url', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('tenant_id', 'name', name='uq_brands_tenant_name'),
    )
    op.create_index('ix_brands_tenant_id', 'brands', ['tenant_id'])

    # 4. brand_categories (depende de brands)
    op.create_table(
        'brand_categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('brands.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.UniqueConstraint('brand_id', 'name', name='uq_brand_categories_brand_name'),
    )
    op.create_index('ix_brand_categories_brand_id', 'brand_categories', ['brand_id'])

    # 5. products (depende de brands y brand_categories)
    op.create_table(
        'products',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('brand_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('brands.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('brand_categories.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('brand_id', 'name', name='uq_products_brand_name'),
    )
    op.create_index('ix_products_brand_id', 'products', ['brand_id'])
    op.create_index('ix_products_category_id', 'products', ['category_id'])

    # 6. product_skus (depende de products)
    op.create_table(
        'product_skus',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('product_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('product_id', 'code', name='uq_product_skus_product_code'),
    )
    op.create_index('ix_product_skus_product_id', 'product_skus', ['product_id'])
    op.create_index('ix_product_skus_code', 'product_skus', ['code'])

    # 7. campaigns.brand_id (depende de brands) — brand (texto) se mantiene por compatibilidad
    op.add_column('campaigns', sa.Column('brand_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_campaigns_brand_id', 'campaigns', 'brands', ['brand_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_campaigns_brand_id', 'campaigns', type_='foreignkey')
    op.drop_column('campaigns', 'brand_id')

    op.drop_index('ix_product_skus_code', table_name='product_skus')
    op.drop_index('ix_product_skus_product_id', table_name='product_skus')
    op.drop_table('product_skus')

    op.drop_index('ix_products_category_id', table_name='products')
    op.drop_index('ix_products_brand_id', table_name='products')
    op.drop_table('products')

    op.drop_index('ix_brand_categories_brand_id', table_name='brand_categories')
    op.drop_table('brand_categories')

    op.drop_index('ix_brands_tenant_id', table_name='brands')
    op.drop_table('brands')

    op.drop_constraint('fk_tenants_sector_id', 'tenants', type_='foreignkey')
    op.drop_column('tenants', 'sector_id')

    op.drop_table('sectors')
