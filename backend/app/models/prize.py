import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Prize(BaseModel):
    __tablename__ = "prizes"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    prize_type: Mapped[str] = mapped_column(String(50), nullable=False, default="articulo")
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    campaign = relationship("Campaign", back_populates=None, foreign_keys=[campaign_id])
    tenant = relationship("Tenant", back_populates=None, foreign_keys=[tenant_id])
