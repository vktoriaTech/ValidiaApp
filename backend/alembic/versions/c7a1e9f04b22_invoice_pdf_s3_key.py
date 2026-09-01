"""add pdf_s3_key to invoices (DT-006)

Revision ID: c7a1e9f04b22
Revises: b7d4e1f9a3c5
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7a1e9f04b22"
down_revision: Union[str, None] = "b7d4e1f9a3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("pdf_s3_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "pdf_s3_key")
