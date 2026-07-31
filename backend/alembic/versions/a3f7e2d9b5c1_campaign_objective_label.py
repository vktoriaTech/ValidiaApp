"""campaign_objective_label

Revision ID: a3f7e2d9b5c1
Revises: 9b2f4d8a1c6e
Create Date: 2026-07-30

"""
from alembic import op
import sqlalchemy as sa

revision = 'a3f7e2d9b5c1'
down_revision = '9b2f4d8a1c6e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'campaigns',
        sa.Column('objective_label', sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('campaigns', 'objective_label')
