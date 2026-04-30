import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Participation(BaseModel):
    __tablename__ = "participations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tickets: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_winner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    winner_prize: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rules_applied: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
    campaign = relationship("Campaign", back_populates=None, foreign_keys=[campaign_id])
    participant = relationship("Participant", back_populates=None, foreign_keys=[participant_id])
    invoice = relationship("Invoice", back_populates=None, foreign_keys=[invoice_id])
