import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CampaignParticipantAccumulation(BaseModel):
    """Perpetual TOTAL of valid invoice amount per (campaign, participant).

    [SPEC-04C v0.3 / D-007] `accumulated_amount` holds the total valid amount
    accumulated, not a remainder — boletas per prize are derived from this
    total at evaluation/draw time (§3.2.5). The balance is never reset by
    time windows — it carries for the whole lifetime of the activity (D-002).
    """

    __tablename__ = "campaign_participant_accumulations"
    __table_args__ = (
        UniqueConstraint("campaign_id", "participant_id", name="uq_camp_part_accum_campaign_participant"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    accumulated_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))

    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
    campaign = relationship("Campaign", back_populates=None, foreign_keys=[campaign_id])
    participant = relationship("Participant", back_populates=None, foreign_keys=[participant_id])
