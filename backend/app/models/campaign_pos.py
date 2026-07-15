import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CampaignPOS(BaseModel):
    __tablename__ = "campaign_pos"
    __table_args__ = (UniqueConstraint("campaign_id", "pos_id", name="uq_campaign_pos"),)

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pos_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pos.id", ondelete="CASCADE"), nullable=False, index=True
    )

    campaign = relationship("Campaign", back_populates=None, foreign_keys=[campaign_id])
    pos = relationship("POS", back_populates=None, foreign_keys=[pos_id])
