import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class CampaignStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"
    closed = "closed"
    archived = "archived"


class Campaign(BaseModel):
    __tablename__ = "campaigns"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status"),
        nullable=False,
        default=CampaignStatus.draft,
    )
    rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    prize_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    qr_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_slug: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    closure_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
