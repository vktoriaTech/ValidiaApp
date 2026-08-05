"""Shared contract for per-activity-type rule modules (SPEC-04B §7).

Each activity type (Sorteo, Incentivo Fuerza de Venta, Compras Consumidor,
Rotación) implements a module exposing:

    def evaluate_participation(
        db: Session,
        campaign: Campaign,
        invoice: Invoice,
        participant: Participant,
        pos: POS | None,
        extra: dict,
    ) -> ParticipationResult: ...

    def select_winners(
        db: Session,
        campaign: Campaign,
        seed: str,
    ) -> list[WinnerAssignment]: ...

`evaluate_participation` takes `db` (not in the SPEC-04B skeleton signature)
because most types need to read/write type-specific persistence — e.g.
Sorteo's CampaignParticipantAccumulation carryover balance.

[SPEC-04C v0.3 / D-007] `select_winners` takes `db` and `seed` (no longer an
`eligible_participations` list) because prize pools are now built from
CampaignParticipantAccumulation, not from precomputed Participation.tickets.
"""
import uuid
from dataclasses import dataclass, field


@dataclass
class ParticipationResult:
    eligible: bool
    reason: str | None
    points: int
    tickets: int
    immediate_winner: bool
    rules_applied: dict = field(default_factory=dict)


@dataclass
class WinnerAssignment:
    """[SPEC-04C v0.3 / D-007] The winner is a participant, not an invoice —
    boletas are computed per prize from the accumulated total at draw time,
    so a single Participation no longer identifies "the" winning entry.
    `tickets` carries the boletas the participant held in this prize's pool,
    for display purposes only.
    """
    participant_id: uuid.UUID
    prize_name: str
    tickets: int = 0
