"""campaign terms versioning and acceptance table

Revision ID: 9b2f4d8a1c6e
Revises: 8efb606e846b
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9b2f4d8a1c6e'
down_revision: Union[str, None] = '8efb606e846b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'campaigns',
        sa.Column('terms_version', sa.Integer(), nullable=False, server_default='1'),
    )

    op.create_table(
        'campaign_terms_acceptances',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('campaign_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('participant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('participants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('terms_version', sa.Integer(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False),
    )
    op.create_index(
        'ix_campaign_terms_acceptances_tenant_id', 'campaign_terms_acceptances', ['tenant_id'],
    )
    op.create_index(
        'ix_campaign_terms_acceptances_campaign_id', 'campaign_terms_acceptances', ['campaign_id'],
    )
    op.create_index(
        'ix_campaign_terms_acceptances_participant_id', 'campaign_terms_acceptances', ['participant_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_campaign_terms_acceptances_participant_id', table_name='campaign_terms_acceptances')
    op.drop_index('ix_campaign_terms_acceptances_campaign_id', table_name='campaign_terms_acceptances')
    op.drop_index('ix_campaign_terms_acceptances_tenant_id', table_name='campaign_terms_acceptances')
    op.drop_table('campaign_terms_acceptances')
    op.drop_column('campaigns', 'terms_version')
