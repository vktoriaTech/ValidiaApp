"""Covers SPEC-04C §12 test cases T05, T06, T07/T08, T09, T12, T13, T14, plus
D-005 (hard-reject auditing) and D-006 (draw with replacement)."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models.audit_log import AuditLog
from app.models.campaign import CampaignStatus
from app.models.campaign_participant_accumulation import CampaignParticipantAccumulation
from app.models.participation import Participation
from app.schemas.participation import DrawRequest, ParticipationCreate
from app.services import cufe_service, participation_service
from app.services.rules import sorteo

from tests.factories import (
    accept_terms,
    fake_dian_response,
    make_admin_user,
    make_campaign,
    make_invoice,
    make_participant,
    make_participation,
    make_tenant,
)


# ── T05 / T06 — single-mode ticket math ─────────────────────────────────────────

def test_t05_single_mode_below_minimum_is_ineligible(db):
    tenant = make_tenant(db)
    campaign = make_campaign(db, tenant, rules={"ticket_mode": "single", "min_amount": 100000})
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T05", amount=80000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is False
    assert result.tickets == 0
    assert result.reason == "invoice_amount_below_minimum"


def test_t06_single_mode_earns_two_tickets(db):
    tenant = make_tenant(db)
    campaign = make_campaign(db, tenant, rules={"ticket_mode": "single", "min_amount": 100000})
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T06", amount=250000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is True
    assert result.tickets == 2


# ── T07 / T08 — accumulated mode carries the remainder forward ─────────────────

def test_t07_t08_accumulated_mode_carries_balance(db):
    tenant = make_tenant(db)
    campaign = make_campaign(db, tenant, rules={"ticket_mode": "accumulated", "min_amount": 100000})
    participant = make_participant(db, tenant)

    # T07 — first invoice, $60K, below the $100K minimum on its own.
    invoice_1 = make_invoice(db, tenant, cufe="CUFE-T07", amount=60000)
    db.commit()
    result_1 = sorteo.evaluate_participation(db, campaign, invoice_1, participant, None, {})
    db.commit()

    assert result_1.eligible is False
    assert result_1.tickets == 0
    assert result_1.rules_applied["accumulated_after"] == 60000.0

    # T08 — second invoice, $70K, added to the $60K balance clears one ticket
    # and leaves $30K remaining.
    invoice_2 = make_invoice(db, tenant, cufe="CUFE-T08", amount=70000)
    db.commit()
    result_2 = sorteo.evaluate_participation(db, campaign, invoice_2, participant, None, {})
    db.commit()

    assert result_2.eligible is True
    assert result_2.tickets == 1
    assert result_2.rules_applied["accumulated_after"] == 30000.0


# ── T09 — duplicate CUFE within the same activity ───────────────────────────────

def test_t09_duplicate_cufe_in_same_campaign_is_rejected(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(db, tenant, rules={"ticket_mode": "single", "min_amount": 100000})
    participant = make_participant(db, tenant, cedula="1111111111")
    accept_terms(db, campaign, participant)
    db.commit()

    monkeypatch.setattr(
        cufe_service, "validate_cufe",
        lambda cufe, tenant_id: fake_dian_response(amount=150000),
    )

    payload = ParticipationCreate(cufe="CUFE-DUP-1", cedula="1111111111", channel="whatsapp")

    first = participation_service.create_participation(db, campaign.id, payload)
    assert first.eligible is True

    with pytest.raises(HTTPException) as exc_info:
        participation_service.create_participation(db, campaign.id, payload)

    assert exc_info.value.status_code == 409


# ── T12 — draw with zero eligible participations ────────────────────────────────

def test_t12_draw_with_no_eligible_participations_returns_400(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        status=CampaignStatus.closed,
        closure_type="system",
        rules={"ticket_mode": "single", "min_amount": 100000, "prizes": [{"name": "Carro", "quantity": 1}]},
    )
    admin = make_admin_user(db, tenant)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        participation_service.run_draw(db, tenant.id, campaign.id, DrawRequest(), admin)

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "no_eligible_participations"


# ── T13 — system draw distributes prizes and stores the seed ───────────────────

def test_t13_system_draw_distributes_prizes_and_stores_seed(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        status=CampaignStatus.closed,
        closure_type="system",
        rules={
            "ticket_mode": "single",
            "min_amount": 100000,
            "prizes": [{"name": "Carro", "quantity": 1}, {"name": "MasterClass", "quantity": 1}],
        },
    )
    admin = make_admin_user(db, tenant)

    # 4 participants, 10 tickets total, 2 prize units to award.
    ticket_counts = [3, 3, 2, 2]
    for i, tickets in enumerate(ticket_counts):
        participant = make_participant(db, tenant, cedula=f"200000000{i}")
        invoice = make_invoice(db, tenant, cufe=f"CUFE-T13-{i}", amount=tickets * 100000)
        make_participation(db, campaign, participant, invoice, tickets=tickets)
    db.commit()

    response = participation_service.run_draw(db, tenant.id, campaign.id, DrawRequest(), admin)

    assert response.closure_type == "system"
    assert len(response.winners) == 2
    assert {w.prize for w in response.winners} == {"Carro", "MasterClass"}
    for winner in response.winners:
        assert winner.tickets > 0

    db.refresh(campaign)
    draw_result = campaign.rules["draw_result"]
    assert draw_result["seed"]
    assert len(draw_result["winners"]) == 2


# ── T14 — /draw is idempotent ────────────────────────────────────────────────────

def test_t14_draw_is_idempotent(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        status=CampaignStatus.closed,
        closure_type="system",
        rules={
            "ticket_mode": "single",
            "min_amount": 100000,
            "prizes": [{"name": "Carro", "quantity": 1}],
        },
    )
    admin = make_admin_user(db, tenant)

    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T14", amount=100000)
    make_participation(db, campaign, participant, invoice, tickets=1)
    db.commit()

    call_count = {"n": 0}
    original_select_winners = sorteo.select_winners

    def counting_select_winners(*args, **kwargs):
        call_count["n"] += 1
        return original_select_winners(*args, **kwargs)

    monkeypatch.setattr(sorteo, "select_winners", counting_select_winners)

    first = participation_service.run_draw(db, tenant.id, campaign.id, DrawRequest(), admin)
    second = participation_service.run_draw(db, tenant.id, campaign.id, DrawRequest(), admin)

    assert call_count["n"] == 1
    assert [w.model_dump() for w in first.winners] == [w.model_dump() for w in second.winners]
    assert first.drawn_at == second.drawn_at


# ── D-005 — POS/date hard rejects are audited even though nothing is saved ─────

def test_d005_pos_hard_reject_is_audited_and_not_persisted(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules={
            "ticket_mode": "single",
            "min_amount": 100000,
            "pos_ids": ["11111111-1111-1111-1111-111111111111"],  # no matching POS exists
        },
    )
    participant = make_participant(db, tenant, cedula="3000000000")
    accept_terms(db, campaign, participant)
    db.commit()

    monkeypatch.setattr(
        cufe_service, "validate_cufe",
        lambda cufe, tenant_id: fake_dian_response(amount=150000, pos_nit="999999999"),
    )

    payload = ParticipationCreate(cufe="CUFE-D005-POS", cedula="3000000000", channel="whatsapp")

    with pytest.raises(HTTPException) as exc_info:
        participation_service.create_participation(db, campaign.id, payload)
    assert exc_info.value.status_code == 422

    # The pool stays clean — no Participation for a hard reject.
    assert db.query(Participation).filter(Participation.campaign_id == campaign.id).count() == 0

    entry = (
        db.query(AuditLog)
        .filter(AuditLog.entity_id == str(campaign.id), AuditLog.action == "campaign.participation_rejected")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert entry is not None
    assert entry.payload == {
        "reason": "pos_not_eligible",
        "cufe": "CUFE-D005-POS",
        "participant_id": str(participant.id),
    }


def test_d005_date_hard_reject_is_audited_and_amount_does_not_accumulate(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules={
            "ticket_mode": "accumulated",
            "min_amount": 100000,
            "date_start": "2026-01-01",
            "date_end": "2026-01-31",
        },
    )
    participant = make_participant(db, tenant, cedula="3000000001")
    accept_terms(db, campaign, participant)
    db.commit()

    out_of_range_date = datetime(2026, 3, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(
        cufe_service, "validate_cufe",
        lambda cufe, tenant_id: fake_dian_response(amount=150000, invoice_date=out_of_range_date),
    )

    payload = ParticipationCreate(cufe="CUFE-D005-DATE", cedula="3000000001", channel="whatsapp")

    with pytest.raises(HTTPException) as exc_info:
        participation_service.create_participation(db, campaign.id, payload)
    assert exc_info.value.status_code == 422

    assert db.query(Participation).filter(Participation.campaign_id == campaign.id).count() == 0

    entry = (
        db.query(AuditLog)
        .filter(AuditLog.entity_id == str(campaign.id), AuditLog.action == "campaign.participation_rejected")
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert entry is not None
    assert entry.payload["reason"] == "invoice_date_out_of_range"

    # R06b — a hard reject must NOT touch the accumulated balance.
    accumulation = db.query(CampaignParticipantAccumulation).filter(
        CampaignParticipantAccumulation.campaign_id == campaign.id,
        CampaignParticipantAccumulation.participant_id == participant.id,
    ).first()
    assert accumulation is None


# ── D-006 — draw WITH replacement ────────────────────────────────────────────────

def test_d006_single_ticket_can_win_more_than_one_prize(db):
    """A pool with exactly one ticket has only one possible outcome per draw
    regardless of the seed — this only holds if the winner's entry stays in
    the pool between prizes (with replacement), proving D-006."""
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules={"prizes": [{"name": "Carro", "quantity": 1}, {"name": "MasterClass", "quantity": 1}]},
    )
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-D006", amount=100000)
    participation = make_participation(db, campaign, participant, invoice, tickets=1)
    db.commit()

    assignments = sorteo.select_winners(campaign, [participation], seed="fixed-seed-for-test")

    assert len(assignments) == 2
    assert {a.participation_id for a in assignments} == {participation.id}
    assert {a.prize_name for a in assignments} == {"Carro", "MasterClass"}
