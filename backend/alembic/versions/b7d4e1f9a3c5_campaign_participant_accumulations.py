"""create campaign_participant_accumulations

Revision ID: b7d4e1f9a3c5
Revises: f1a9c3d7b2e4
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7d4e1f9a3c5'
down_revision: Union[str, None] = 'f1a9c3d7b2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'campaign_participant_accumulations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('campaign_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('participant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('participants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('accumulated_amount', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.UniqueConstraint('campaign_id', 'participant_id', name='uq_camp_part_accum_campaign_participant'),
    )
    op.create_index('ix_campaign_participant_accumulations_tenant_id', 'campaign_participant_accumulations', ['tenant_id'])
    op.create_index('ix_campaign_participant_accumulations_campaign_id', 'campaign_participant_accumulations', ['campaign_id'])
    op.create_index('ix_campaign_participant_accumulations_participant_id', 'campaign_participant_accumulations', ['participant_id'])


def downgrade() -> None:
    op.drop_index('ix_campaign_participant_accumulations_participant_id', table_name='campaign_participant_accumulations')
    op.drop_index('ix_campaign_participant_accumulations_campaign_id', table_name='campaign_participant_accumulations')
    op.drop_index('ix_campaign_participant_accumulations_tenant_id', table_name='campaign_participant_accumulations')
    op.drop_table('campaign_participant_accumulations')
