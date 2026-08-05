"""Sorteo rule module (SPEC-04C v0.3, D-007).

Implements the two functions required by the SPEC-04B contract:
- evaluate_participation(): per-invoice accumulation + per-prize ticket math.
- select_winners(): per-prize random draw over the ticket pool for a
  system-closed activity.

Field reconciliation (SPEC-04C §3.1, authoritative over any other name in the
specs): Invoice.amount (not total_amount), Invoice.invoice_date (not
issue_date), Invoice.pos_nit (no pos_id — POS eligibility is resolved by NIT).

Rules model (§3.2, authoritative — supersedes the single-threshold/
"remainder" model of v0.2):
- Mechanic is always "acumulacion" (participation_method) — the single MVP
  mechanic. Rules (JSONB) define eligibility per prize.
- CampaignParticipantAccumulation.accumulated_amount holds the TOTAL valid
  amount accumulated by a participant, not a remainder — boletas per prize
  are derived from that total, never persisted directly (§3.2.5).
"""
import random
import uuid
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.campaign_participant_accumulation import CampaignParticipantAccumulation
from app.models.invoice import Invoice
from app.models.participant import Participant
from app.models.pos import POS
from app.models.prize import Prize
from app.services.rules.base import ParticipationResult, WinnerAssignment


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def _within_range(invoice_date: datetime, date_start: str | None, date_end: str | None) -> bool:
    invoice_day = invoice_date.date() if isinstance(invoice_date, datetime) else invoice_date
    start = _parse_date(date_start)
    end = _parse_date(date_end)
    if start and invoice_day < start:
        return False
    if end and invoice_day > end:
        return False
    return True


def _get_or_create_accumulation(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, participant_id: uuid.UUID
) -> CampaignParticipantAccumulation:
    accumulation = (
        db.query(CampaignParticipantAccumulation)
        .filter(
            CampaignParticipantAccumulation.campaign_id == campaign_id,
            CampaignParticipantAccumulation.participant_id == participant_id,
        )
        .first()
    )
    if accumulation is None:
        accumulation = CampaignParticipantAccumulation(
            tenant_id=tenant_id,
            campaign_id=campaign_id,
            participant_id=participant_id,
            accumulated_amount=Decimal("0"),
        )
        db.add(accumulation)
        db.flush()
    return accumulation


def _boletas_for(total: Decimal, min_amount: Decimal, max_participations: int) -> int:
    """§3.2.2: boletas_p = min(floor(total / umbral_p), tope_p) if total >= umbral_p, else 0."""
    if min_amount <= 0 or total < min_amount:
        return 0
    return min(int(total // min_amount), max_participations)


def evaluate_participation(
    db: Session,
    campaign: Campaign,
    invoice: Invoice,
    participant: Participant,
    pos: POS | None,
    extra: dict,
) -> ParticipationResult:
    rules = campaign.rules or {}

    # R01 — invoice must fall inside the activity's date range. Hard reject:
    # nothing persisted, the amount does not accumulate (D-005/R06b).
    if invoice.invoice_date is None or not _within_range(
        invoice.invoice_date, rules.get("date_start"), rules.get("date_end")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"reason": "invoice_date_out_of_range"},
        )

    # R02 — invoice POS (by NIT) must be in the activity's allowed POS list,
    # when one is configured. Empty pos_ids = all tenant POS allowed. Hard
    # reject: nothing persisted, the amount does not accumulate (D-005/R06b).
    pos_ids = rules.get("pos_ids") or []
    if pos_ids:
        allowed_nits = {
            row.nit_emisor
            for row in db.query(POS).filter(POS.id.in_(pos_ids), POS.tenant_id == campaign.tenant_id).all()
            if row.nit_emisor
        }
        if not invoice.pos_nit or invoice.pos_nit not in allowed_nits:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"reason": "pos_not_eligible"},
            )

    invoice_amount = invoice.amount or Decimal("0")

    # §3.2.5 / §7.1 step 3 — single mechanic (acumulacion): the balance is
    # the TOTAL valid amount accumulated, perpetual for the activity's whole
    # lifetime (D-002), never a per-prize remainder.
    accumulation = _get_or_create_accumulation(db, campaign.tenant_id, campaign.id, participant.id)
    accumulation.accumulated_amount = (accumulation.accumulated_amount or Decimal("0")) + invoice_amount
    total = accumulation.accumulated_amount

    # §7.1 step 4 — boletas are calculated per prize from the total, at
    # every participation (not just at draw time), so the caller/bot can
    # report a live headline number.
    prize_rules = ((rules.get("eligibility") or {}).get("prizes")) or []
    per_prize = []
    for p in prize_rules:
        min_amount = Decimal(str(p.get("min_amount") or 0))
        max_participations = int(p.get("max_participations") or 0)
        boletas = _boletas_for(total, min_amount, max_participations)
        per_prize.append({
            "prize_order": p.get("prize_order"),
            "min_amount": float(min_amount),
            "max_participations": max_participations,
            "boletas": boletas,
        })

    eligible = any(item["boletas"] > 0 for item in per_prize)
    reason = None if eligible else "invoice_amount_below_minimum"

    # §7.1 step 6 — headline ticket count: boletas of the lowest-threshold
    # prize. Informative only; select_winners() recomputes per prize from
    # the accumulated total and never reads this number.
    tickets = min(per_prize, key=lambda item: item["min_amount"])["boletas"] if per_prize else 0

    rules_applied = {
        "mechanic": rules.get("mechanic", "acumulacion"),
        "accumulated_total": float(total),
        "invoice_amount": float(invoice_amount),
        "per_prize": per_prize,
        "rejection_reason": reason,
    }

    return ParticipationResult(
        eligible=eligible,
        reason=reason,
        points=0,
        tickets=tickets,
        immediate_winner=False,
        rules_applied=rules_applied,
    )


def select_winners(
    db: Session,
    campaign: Campaign,
    seed: str,
) -> list[WinnerAssignment]:
    """[D-003/D-006, §7.2 v0.3] One pool per prize, built from the activity's
    accumulations. Random draw WITH replacement inside each pool — the
    winner's boletas stay in the pool, so a participant may win more than one
    prize (R08). A prize nobody qualifies for is left deserted.
    """
    prizes = (
        db.query(Prize)
        .filter(Prize.campaign_id == campaign.id)
        .order_by(Prize.order.desc())
        .all()
    )
    if not prizes:
        return []

    rules_by_prize_order = {
        p.get("prize_order"): p
        for p in ((campaign.rules or {}).get("eligibility") or {}).get("prizes") or []
    }

    accumulations = (
        db.query(CampaignParticipantAccumulation)
        .filter(CampaignParticipantAccumulation.campaign_id == campaign.id)
        .all()
    )

    rng = random.Random(seed)
    assignments: list[WinnerAssignment] = []

    for prize in prizes:
        rule = rules_by_prize_order.get(prize.order)
        if rule is None:
            continue  # no eligibility rule configured for this prize order

        min_amount = Decimal(str(rule.get("min_amount") or 0))
        max_participations = int(rule.get("max_participations") or 0)

        pool: list[uuid.UUID] = []
        boletas_by_participant: dict[uuid.UUID, int] = {}
        for accumulation in accumulations:
            total = accumulation.accumulated_amount or Decimal("0")
            boletas = _boletas_for(total, min_amount, max_participations)
            if boletas > 0:
                pool.extend([accumulation.participant_id] * boletas)
                boletas_by_participant[accumulation.participant_id] = boletas

        if not pool:
            continue  # prize deserted — nobody qualifies

        for _ in range(prize.quantity):
            winner_id = rng.choice(pool)
            assignments.append(WinnerAssignment(
                participant_id=winner_id,
                prize_name=prize.name,
                tickets=boletas_by_participant[winner_id],
            ))

    return assignments
