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
        campaign: Campaign,
        eligible_participations: list[Participation],
        seed: str,
    ) -> list[WinnerAssignment]: ...

`evaluate_participation` takes `db` (not in the SPEC-04B skeleton signature)
because most types need to read/write type-specific persistence — e.g.
Sorteo's CampaignParticipantAccumulation carryover balance.
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
    participation_id: uuid.UUID
    prize_name: str
