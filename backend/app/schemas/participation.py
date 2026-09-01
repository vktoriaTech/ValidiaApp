import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


# ── Register participation (participant/bot) ────────────────────────────────────

class ParticipationCreate(BaseModel):
    cufe: str
    nit_emisor: str
    cedula: str
    phone_wa: str | None = None
    full_name: str | None = None
    channel: str = "whatsapp"


class ParticipationResponse(BaseModel):
    participation_id: uuid.UUID
    eligible: bool
    tickets_earned: int
    tickets_total: int
    accumulated_total: Decimal | None = None
    reason: str | None = None


# ── List participations (admin) ──────────────────────────────────────────────────

class ParticipationListItem(BaseModel):
    id: uuid.UUID
    participant_cedula: str
    participant_name: str | None
    invoice_cufe: str
    eligible: bool
    points: int
    tickets: int
    is_winner: bool
    winner_prize: str | None
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ParticipationRow(BaseModel):
    """Fila enriquecida para la vista de participantes (SPEC-04B-B §2): toda la
    info del participante + su factura."""
    id: uuid.UUID
    participant_cedula: str
    participant_name: str | None = None
    participant_phone: str | None = None
    invoice_cufe: str
    invoice_amount: Decimal | None = None
    invoice_date: datetime | None = None
    pos_nit: str | None = None
    tickets: int
    eligible: bool
    is_winner: bool
    winner_prize: str | None = None
    accumulated_total: Decimal | None = None
    created_at: datetime


class PaginatedParticipations(BaseModel):
    items: list[ParticipationRow]
    total: int
    page: int
    pages: int


# ── Draw ──────────────────────────────────────────────────────────────────────

class ExternalWinnerItem(BaseModel):
    participation_id: uuid.UUID
    prize_name: str


class DrawRequest(BaseModel):
    winners: list[ExternalWinnerItem] | None = None


class WinnerResponse(BaseModel):
    participant_id: uuid.UUID
    participant_name: str | None
    cedula: str
    tickets: int
    prize: str


class DrawResponse(BaseModel):
    drawn_at: datetime
    closure_type: str
    winners: list[WinnerResponse]
