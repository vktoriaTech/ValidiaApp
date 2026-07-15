import enum
import uuid
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, Time
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"
    archived = "archived"


class ActivityType(str, enum.Enum):
    sorteo = "sorteo"
    incentivo_fuerza_venta = "incentivo_fuerza_venta"
    compras_consumidor = "compras_consumidor"
    rotacion = "rotacion"


class Campaign(BaseModel):
    __tablename__ = "campaigns"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_type: Mapped[ActivityType | None] = mapped_column(
        Enum(ActivityType, name="activity_type"), nullable=True
    )
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status"),
        nullable=False,
        default=CampaignStatus.draft,
    )
    objective_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    objective_value: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    raffle_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    participation_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    closure_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    terms_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    prize_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    qr_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_slug: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True, index=True)
    qr_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
