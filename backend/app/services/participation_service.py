import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_terms_acceptance import CampaignTermsAcceptance
from app.models.invoice import Invoice, ValidationStatus
from app.models.participant import Participant
from app.models.participation import Participation
from app.models.user import User, UserRole
from app.schemas.participation import (
    DrawRequest,
    DrawResponse,
    ExternalWinnerItem,
    ParticipationCreate,
    ParticipationListItem,
    ParticipationResponse,
    WinnerResponse,
)
from app.services import cufe_service
from app.services.rules import get_rule_module
from app.services.rules.base import WinnerAssignment

# ── Access helpers (admin endpoints) ────────────────────────────────────────────

def _check_read_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")


def _check_write_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.role == UserRole.tenant_viewer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")

# ── Audit helper ──────────────────────────────────────────────────────────────

def _audit(db: Session, *, tenant_id: uuid.UUID, user_id: uuid.UUID | None,
           action: str, entity_id: str, payload: dict | None = None) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id, user_id=user_id,
        entity="campaign", entity_id=entity_id,
        action=action, payload=payload,
    ))

# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _get_campaign_public(db: Session, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")
    return campaign


def _get_campaign_admin(db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.tenant_id == tenant_id
    ).first()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")
    return campaign


def _get_or_create_participant(
    db: Session, tenant_id: uuid.UUID, cedula: str, phone_wa: str | None, full_name: str | None
) -> Participant:
    participant = db.query(Participant).filter(
        Participant.tenant_id == tenant_id, Participant.cedula == cedula
    ).first()
    if participant is None:
        participant = Participant(
            tenant_id=tenant_id, cedula=cedula, phone_wa=phone_wa, full_name=full_name,
        )
        db.add(participant)
        db.flush()
    else:
        if phone_wa:
            participant.phone_wa = phone_wa
        if full_name:
            participant.full_name = full_name
    return participant


def _get_or_create_invoice(db: Session, tenant_id: uuid.UUID, cufe: str) -> Invoice:
    existing = db.query(Invoice).filter(
        Invoice.tenant_id == tenant_id,
        Invoice.cufe == cufe,
        Invoice.validation_status == ValidationStatus.accepted,
    ).first()
    if existing is not None:
        return existing

    result = cufe_service.validate_cufe(cufe, str(tenant_id))
    if result.get("estado_dian") != "Valida":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El CUFE no es válido o no fue encontrado en la DIAN",
        )

    fields = cufe_service.extract_invoice_fields(result)
    invoice = Invoice(
        tenant_id=tenant_id,
        participant_id=None,
        cufe=cufe,
        pos_nit=fields["pos_nit"],
        amount=fields["amount"],
        invoice_date=fields["invoice_date"],
        raw_data=result,
        validation_status=ValidationStatus.accepted,
    )
    db.add(invoice)
    db.flush()
    return invoice


def _tickets_total(db: Session, campaign_id: uuid.UUID, participant_id: uuid.UUID) -> int:
    total = db.query(func.sum(Participation.tickets)).filter(
        Participation.campaign_id == campaign_id, Participation.participant_id == participant_id
    ).scalar()
    return int(total or 0)


def _reason_of(participation: Participation) -> str | None:
    if not participation.rules_applied:
        return None
    return participation.rules_applied.get("rejection_reason") or participation.rules_applied.get("reason")


def _is_eligible(participation: Participation) -> bool:
    return participation.tickets > 0 or participation.points > 0 or participation.is_winner

# ══════════════════════════════════════════════════════════════════════════════
# Register participation (public — participant/bot)
# ══════════════════════════════════════════════════════════════════════════════

def create_participation(
    db: Session, campaign_id: uuid.UUID, payload: ParticipationCreate
) -> ParticipationResponse:
    campaign = _get_campaign_public(db, campaign_id)

    if campaign.status != CampaignStatus.active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="La actividad no está activa")

    rule_module = get_rule_module(campaign.activity_type)

    participant = _get_or_create_participant(
        db, campaign.tenant_id, payload.cedula, payload.phone_wa, payload.full_name
    )

    acceptance = db.query(CampaignTermsAcceptance).filter(
        CampaignTermsAcceptance.campaign_id == campaign.id,
        CampaignTermsAcceptance.participant_id == participant.id,
        CampaignTermsAcceptance.terms_version == campaign.terms_version,
    ).first()
    if acceptance is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="terms_not_accepted")

    invoice = _get_or_create_invoice(db, campaign.tenant_id, payload.cufe)

    duplicate = (
        db.query(Participation)
        .join(Invoice, Participation.invoice_id == Invoice.id)
        .filter(Participation.campaign_id == campaign.id, Invoice.cufe == payload.cufe)
        .first()
    )
    if duplicate is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Este CUFE ya participó en esta actividad")

    try:
        result = rule_module.evaluate_participation(db, campaign, invoice, participant, None, {})
    except HTTPException as exc:
        # D-005 — POS/date hard rejects raise before any Participation is
        # created (the pool must stay clean), but they still need a trace:
        # audit and commit here, then let the 422 propagate unchanged.
        reason = exc.detail.get("reason") if isinstance(exc.detail, dict) else None
        _audit(
            db, tenant_id=campaign.tenant_id, user_id=None,
            action="campaign.participation_rejected", entity_id=str(campaign.id),
            payload={"reason": reason, "cufe": payload.cufe, "participant_id": str(participant.id)},
        )
        db.commit()
        raise

    participation = Participation(
        tenant_id=campaign.tenant_id,
        campaign_id=campaign.id,
        participant_id=participant.id,
        invoice_id=invoice.id,
        points=result.points,
        tickets=result.tickets,
        is_winner=result.immediate_winner,
        rules_applied=result.rules_applied,
    )
    db.add(participation)
    db.flush()

    _audit(
        db, tenant_id=campaign.tenant_id, user_id=None,
        action="campaign.participation_registered" if result.eligible else "campaign.participation_rejected",
        entity_id=str(campaign.id),
        payload={"participation_id": str(participation.id), "eligible": result.eligible, "reason": result.reason},
    )
    if result.tickets > 0:
        _audit(db, tenant_id=campaign.tenant_id, user_id=None,
               action="sorteo.tickets_generated", entity_id=str(campaign.id),
               payload={"participation_id": str(participation.id), "tickets": result.tickets})
    if not result.eligible:
        _audit(db, tenant_id=campaign.tenant_id, user_id=None,
               action="sorteo.participation_ineligible", entity_id=str(campaign.id),
               payload={"participation_id": str(participation.id), "reason": result.reason})
    if result.rules_applied.get("accumulated_total") is not None:
        _audit(db, tenant_id=campaign.tenant_id, user_id=None,
               action="sorteo.accumulation_updated", entity_id=str(campaign.id),
               payload={"participant_id": str(participant.id), "accumulated_total": result.rules_applied.get("accumulated_total")})

    db.commit()
    db.refresh(participation)

    return ParticipationResponse(
        participation_id=participation.id,
        eligible=result.eligible,
        tickets_earned=result.tickets,
        tickets_total=_tickets_total(db, campaign.id, participant.id),
        accumulated_total=result.rules_applied.get("accumulated_total"),
        reason=result.reason,
    )

# ══════════════════════════════════════════════════════════════════════════════
# List participations (admin)
# ══════════════════════════════════════════════════════════════════════════════

def list_participations(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User,
    eligible: bool | None = None,
) -> list[ParticipationListItem]:
    _check_read_access(current_user, tenant_id)
    _get_campaign_admin(db, tenant_id, campaign_id)

    rows = (
        db.query(Participation, Participant, Invoice)
        .join(Participant, Participation.participant_id == Participant.id)
        .join(Invoice, Participation.invoice_id == Invoice.id)
        .filter(Participation.campaign_id == campaign_id)
        .order_by(Participation.created_at.desc())
        .all()
    )

    items = [
        ParticipationListItem(
            id=participation.id,
            participant_cedula=participant.cedula,
            participant_name=participant.full_name,
            invoice_cufe=invoice.cufe,
            eligible=_is_eligible(participation),
            points=participation.points,
            tickets=participation.tickets,
            is_winner=participation.is_winner,
            winner_prize=participation.winner_prize,
            reason=_reason_of(participation),
            created_at=participation.created_at,
        )
        for participation, participant, invoice in rows
    ]

    if eligible is not None:
        items = [item for item in items if item.eligible == eligible]

    return items

# ══════════════════════════════════════════════════════════════════════════════
# Draw (admin)
# ══════════════════════════════════════════════════════════════════════════════

def _draw_response_from_stored(stored: dict) -> DrawResponse:
    return DrawResponse(
        drawn_at=stored["drawn_at"],
        closure_type=stored["closure_type"],
        winners=[WinnerResponse(**w) for w in stored["winners"]],
    )


def run_draw(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, payload: DrawRequest, current_user: User
) -> DrawResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign_admin(db, tenant_id, campaign_id)

    if campaign.status != CampaignStatus.closed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="La actividad debe estar cerrada para ejecutar el sorteo")

    rules = dict(campaign.rules or {})

    # R12 — idempotent: a previous draw result short-circuits re-running the algorithm.
    stored = rules.get("draw_result")
    if stored is not None:
        return _draw_response_from_stored(stored)

    if campaign.closure_type == "external":
        response, seed = _register_external_winners(db, campaign, payload)
    else:
        response, seed = _run_system_draw(db, campaign)

    rules["draw_result"] = {
        "seed": seed,
        "drawn_at": response.drawn_at.isoformat(),
        "closure_type": response.closure_type,
        "winners": [w.model_dump(mode="json") for w in response.winners],
    }
    campaign.rules = rules

    db.commit()
    return response


def _run_system_draw(db: Session, campaign: Campaign) -> tuple[DrawResponse, str]:
    rule_module = get_rule_module(campaign.activity_type)

    seed = secrets.token_hex(16)
    # [§7.2 v0.3] select_winners builds its own pools per prize from
    # CampaignParticipantAccumulation — no precomputed participation list.
    assignments = rule_module.select_winners(db, campaign, seed)
    if not assignments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="no_eligible_participations")

    winners = _apply_assignments(db, campaign, assignments)

    _audit(db, tenant_id=campaign.tenant_id, user_id=None,
           action="sorteo.draw_executed", entity_id=str(campaign.id),
           payload={"seed": seed, "winners": len(assignments)})
    _audit(db, tenant_id=campaign.tenant_id, user_id=None,
           action="sorteo.draw_seed_stored", entity_id=str(campaign.id),
           payload={"seed": seed})
    _audit(db, tenant_id=campaign.tenant_id, user_id=None,
           action="campaign.draw_completed", entity_id=str(campaign.id),
           payload={"closure_type": "system", "winners": len(assignments)})

    response = DrawResponse(
        drawn_at=datetime.now(timezone.utc),
        closure_type="system",
        winners=winners,
    )
    return response, seed


def _register_external_winners(
    db: Session, campaign: Campaign, payload: DrawRequest
) -> tuple[DrawResponse, None]:
    if not payload.winners:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Se requiere la lista de ganadores para cierre externo")

    # The external-closure admin still identifies winners by participation_id
    # (the specific invoice submission a notary points to); we resolve each
    # to its participant to build the same WinnerAssignment contract used by
    # the system draw (§7.2 v0.3 — the winner is a participant, not an invoice).
    participation_ids = {w.participation_id for w in payload.winners}
    found = db.query(Participation).filter(
        Participation.id.in_(participation_ids), Participation.campaign_id == campaign.id
    ).all()
    if len(found) != len(participation_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Una o más participation_id no existen en esta actividad")
    participation_by_id = {p.id: p for p in found}

    assignments = [
        WinnerAssignment(
            participant_id=participation_by_id[w.participation_id].participant_id,
            prize_name=w.prize_name,
            tickets=participation_by_id[w.participation_id].tickets,
        )
        for w in payload.winners
    ]

    winners = _apply_assignments(db, campaign, assignments)

    _audit(db, tenant_id=campaign.tenant_id, user_id=None,
           action="sorteo.winners_registered_external", entity_id=str(campaign.id),
           payload={"winners": len(assignments)})
    _audit(db, tenant_id=campaign.tenant_id, user_id=None,
           action="campaign.draw_completed", entity_id=str(campaign.id),
           payload={"closure_type": "external", "winners": len(assignments)})

    response = DrawResponse(
        drawn_at=datetime.now(timezone.utc),
        closure_type="external",
        winners=winners,
    )
    return response, None


def _apply_assignments(
    db: Session, campaign: Campaign, assignments: list[WinnerAssignment]
) -> list[WinnerResponse]:
    """[§7.2 v0.3] Winners are participants, not invoices — a participant can
    qualify for several prizes' pools (R08). Marks every Participation the
    winning participant has in this activity as is_winner, folding all prizes
    they won into winner_prize (comma-joined, deduplicated — the column is a
    single string). Name/cedula are resolved from Participant directly.
    """
    participant_ids = {a.participant_id for a in assignments}
    participants = db.query(Participant).filter(Participant.id.in_(participant_ids)).all()
    participants_by_id = {p.id: p for p in participants}

    won_prizes: dict[uuid.UUID, list[str]] = {}
    for assignment in assignments:
        prize_names = won_prizes.setdefault(assignment.participant_id, [])
        if assignment.prize_name not in prize_names:
            prize_names.append(assignment.prize_name)

    participations = db.query(Participation).filter(
        Participation.campaign_id == campaign.id,
        Participation.participant_id.in_(participant_ids),
    ).all()
    for participation in participations:
        prize_names = won_prizes.get(participation.participant_id)
        if not prize_names:
            continue
        participation.is_winner = True
        participation.winner_prize = ", ".join(prize_names)

    winners: list[WinnerResponse] = []
    for assignment in assignments:
        participant = participants_by_id.get(assignment.participant_id)
        winners.append(WinnerResponse(
            participant_id=assignment.participant_id,
            participant_name=participant.full_name if participant else None,
            cedula=participant.cedula if participant else "",
            tickets=assignment.tickets,
            prize=assignment.prize_name,
        ))
    return winners

# ══════════════════════════════════════════════════════════════════════════════
# List winners (admin)
# ══════════════════════════════════════════════════════════════════════════════

def list_winners(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[WinnerResponse]:
    _check_read_access(current_user, tenant_id)
    campaign = _get_campaign_admin(db, tenant_id, campaign_id)

    stored = (campaign.rules or {}).get("draw_result")
    if stored is None:
        return []
    return [WinnerResponse(**w) for w in stored.get("winners", [])]
