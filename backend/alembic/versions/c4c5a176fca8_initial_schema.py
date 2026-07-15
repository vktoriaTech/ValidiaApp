"""initial schema

Revision ID: c4c5a176fca8
Revises:
Create Date: 2026-07-15 10:51:20.969238

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4c5a176fca8'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pos_type: VARCHAR → Enum. PostgreSQL requires USING for the column cast
    # AND the existing VARCHAR DEFAULT must be dropped first; otherwise PG also
    # tries to cast the default expression implicitly and fails.
    # The pos_type enum type already exists in the DB (created by init_db).
    op.execute("ALTER TABLE pos ALTER COLUMN pos_type DROP DEFAULT")
    op.execute(
        "ALTER TABLE pos ALTER COLUMN pos_type TYPE pos_type "
        "USING pos_type::text::pos_type"
    )
    op.execute("ALTER TABLE pos ALTER COLUMN pos_type SET DEFAULT 'propio'::pos_type")

    op.alter_column('pos', 'nit_emisor',
               existing_type=sa.VARCHAR(length=20),
               nullable=True)

    # VARCHAR width changes and NUMERIC → Float are safe implicit casts in PG.
    op.alter_column('pos', 'city',
               existing_type=sa.VARCHAR(length=80),
               type_=sa.String(length=100),
               existing_nullable=True)
    op.alter_column('pos', 'address',
               existing_type=sa.VARCHAR(length=160),
               type_=sa.Text(),
               existing_nullable=True)
    op.alter_column('pos', 'lat',
               existing_type=sa.NUMERIC(precision=10, scale=7),
               type_=sa.Float(),
               existing_nullable=True)
    op.alter_column('pos', 'lng',
               existing_type=sa.NUMERIC(precision=10, scale=7),
               type_=sa.Float(),
               existing_nullable=True)


def downgrade() -> None:
    op.alter_column('pos', 'lng',
               existing_type=sa.Float(),
               type_=sa.NUMERIC(precision=10, scale=7),
               existing_nullable=True)
    op.alter_column('pos', 'lat',
               existing_type=sa.Float(),
               type_=sa.NUMERIC(precision=10, scale=7),
               existing_nullable=True)
    op.alter_column('pos', 'address',
               existing_type=sa.Text(),
               type_=sa.VARCHAR(length=160),
               existing_nullable=True)
    op.alter_column('pos', 'city',
               existing_type=sa.String(length=100),
               type_=sa.VARCHAR(length=80),
               existing_nullable=True)
    op.alter_column('pos', 'nit_emisor',
               existing_type=sa.VARCHAR(length=20),
               nullable=False)

    # Revert pos_type Enum → VARCHAR. Drop enum type after column revert.
    op.execute(
        "ALTER TABLE pos ALTER COLUMN pos_type TYPE VARCHAR(20) "
        "USING pos_type::text"
    )
    op.execute("DROP TYPE IF EXISTS pos_type")
