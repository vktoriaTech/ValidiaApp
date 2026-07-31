"""Sorteo rule module (SPEC-04C).

Implements the two functions required by the SPEC-04B contract:
- evaluate_participation(): ticket math for a single invoice-backed participation.
- select_winners(): random draw over the ticket pool for a system-closed activity.

Field reconciliation (SPEC-04C §3.1, authoritative over any other name in the
specs): Invoice.amount (not total_amount), Invoice.invoice_date (not
issue_date), Invoice.pos_nit (no pos_id — POS eligibility is resolved by NIT).
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
from app.models.participation import Participation
from app.models.pos import POS
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


def evaluate_participation(
    db: Session,
    campaign: Campaign,
    invoice: Invoice,
    participant: Participant,
    pos: POS | None,
    extra: dict,
) -> ParticipationResult:
    rules = campaign.rules or {}
    ticket_mode = rules.get("ticket_mode", "single")
    min_amount = Decimal(str(rules.get("min_amount") or 0))

    # R01 — invoice must fall inside the activity's date range. A structural
    # mismatch (not "not yet eligible"): rejected up front, nothing persisted.
    if invoice.invoice_date is None or not _within_range(
        invoice.invoice_date, rules.get("date_start"), rules.get("date_end")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"reason": "invoice_date_out_of_range"},
        )

    # R02 — invoice POS (by NIT) must be in the activity's allowed POS list,
    # when one is configured. Empty pos_ids = all tenant POS allowed.
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

    accumulated_before: Decimal | None = None
    accumulation: CampaignParticipantAccumulation | None = None
    if ticket_mode == "accumulated":
        accumulation = _get_or_create_accumulation(db, campaign.tenant_id, campaign.id, participant.id)
        accumulated_before = accumulation.accumulated_amount or Decimal("0")
        effective_amount = accumulated_before + invoice_amount
    else:
        effective_amount = invoice_amount

    if min_amount > 0:
        tickets = int(effective_amount // min_amount)
        remainder = effective_amount - (tickets * min_amount)
    else:
        tickets = 0
        remainder = effective_amount

    # R06 / R06b — the accumulated balance is perpetual and updates whenever
    # the invoice passed POS + date validation, even if it didn't earn a
    # ticket (D-002). Invoices that fail R01/R02 never reach this point.
    if accumulation is not None:
        accumulation.accumulated_amount = remainder

    eligible = tickets > 0
    rejection_reason = None if eligible else "invoice_amount_below_minimum"

    rules_applied = {
        "ticket_mode": ticket_mode,
        "min_amount": float(min_amount),
        "invoice_amount": float(invoice_amount),
        "accumulated_before": float(accumulated_before) if accumulated_before is not None else None,
        "accumulated_after": float(remainder) if ticket_mode == "accumulated" else None,
        "tickets_earned": tickets,
        "rejection_reason": rejection_reason,
    }

    return ParticipationResult(
        eligible=eligible,
        reason=rejection_reason,
        points=0,
        tickets=tickets,
        immediate_winner=False,
        rules_applied=rules_applied,
    )


def select_winners(
    campaign: Campaign,
    eligible_participations: list[Participation],
    seed: str,
) -> list[WinnerAssignment]:
    """[D-003] Simple random draw, no participant exclusion between prizes.

    Builds a ticket pool (one entry per ticket, not deduplicated by
    participant), shuffles it deterministically with `seed`, then consumes it
    sequentially — one pool position per prize unit. Entries are never
    removed, so the same participation can be drawn again for a later prize
    if another one of its tickets lands on a later position (R08).
    """
    pool: list[uuid.UUID] = []
    for participation in eligible_participations:
        pool.extend([participation.id] * participation.tickets)

    rng = random.Random(seed)
    rng.shuffle(pool)

    prizes = (campaign.rules or {}).get("prizes") or []
    assignments: list[WinnerAssignment] = []
    pool_index = 0
    for prize in prizes:
        prize_name = prize.get("name")
        quantity = int(prize.get("quantity", 1))
        for _ in range(quantity):
            if pool_index >= len(pool):
                return assignments
            assignments.append(WinnerAssignment(participation_id=pool[pool_index], prize_name=prize_name))
            pool_index += 1

    return assignments
