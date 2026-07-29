import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CampaignTermsAcceptance(BaseModel):
    """Registra qué participante aceptó qué versión de los TyC de una actividad.

    Fuente de verdad legal para trazabilidad: Participant.terms_accepted_at es
    solo un timestamp de conveniencia (última aceptación global), esta tabla
    es la que responde "¿qué versión de los TyC de qué actividad aceptó este
    participante y cuándo?".
    """

    __tablename__ = "campaign_terms_acceptances"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    terms_version: Mapped[int] = mapped_column(Integer, nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)

    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
    campaign = relationship("Campaign", back_populates=None, foreign_keys=[campaign_id])
    participant = relationship("Participant", back_populates=None, foreign_keys=[participant_id])
