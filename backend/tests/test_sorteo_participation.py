"""Covers SPEC-04C v0.3 §12 test cases T05, T06, T05b, T07, T08, T08b, T08c,
T09, T12, T13, T14, plus D-005 (hard-reject auditing) and D-006 (draw with
replacement) under the per-prize threshold model (D-007)."""
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
    make_accumulation,
    make_admin_user,
    make_campaign,
    make_invoice,
    make_participant,
    make_prize,
    make_tenant,
    sorteo_rules,
)


# ── T05 / T06 / T05b — single-prize ticket math (§3.2.2) ────────────────────────

def test_t05_below_threshold_is_ineligible(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T05", amount=80000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is False
    assert result.tickets == 0
    assert result.reason == "invoice_amount_below_minimum"
    assert result.rules_applied["accumulated_total"] == 80000.0
    assert result.rules_applied["per_prize"] == [
        {"prize_order": 1, "min_amount": 100000.0, "max_participations": 5, "boletas": 0},
    ]


def test_t06_earns_two_tickets(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T06", amount=250000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is True
    assert result.tickets == 2
    assert result.rules_applied["accumulated_total"] == 250000.0
    assert result.rules_applied["per_prize"][0]["boletas"] == 2


def test_t05b_gate_prize_caps_at_one_ticket(db):
    """max_participations=1 behaves as a gate: floor(500K/100K)=5 boletas,
    capped to 1."""
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 1}]),
    )
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T05B", amount=500000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is True
    assert result.tickets == 1
    assert result.rules_applied["per_prize"][0]["boletas"] == 1


# ── T07 / T08 — accumulated TOTAL carries across invoices (§3.2.5) ──────────────

def test_t07_t08_accumulation_carries_total_across_invoices(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
    participant = make_participant(db, tenant)

    # T07 — first invoice, $60K, below the $100K threshold on its own.
    invoice_1 = make_invoice(db, tenant, cufe="CUFE-T07", amount=60000)
    db.commit()
    result_1 = sorteo.evaluate_participation(db, campaign, invoice_1, participant, None, {})
    db.commit()

    assert result_1.eligible is False
    assert result_1.tickets == 0
    assert result_1.rules_applied["accumulated_total"] == 60000.0

    # T08 — second invoice, $70K; the accumulated TOTAL (not a remainder)
    # reaches $130K, which clears one ticket for the prize.
    invoice_2 = make_invoice(db, tenant, cufe="CUFE-T08", amount=70000)
    db.commit()
    result_2 = sorteo.evaluate_participation(db, campaign, invoice_2, participant, None, {})
    db.commit()

    assert result_2.eligible is True
    assert result_2.tickets == 1
    assert result_2.rules_applied["accumulated_total"] == 130000.0

    accumulation = db.query(CampaignParticipantAccumulation).filter(
        CampaignParticipantAccumulation.campaign_id == campaign.id,
        CampaignParticipantAccumulation.participant_id == participant.id,
    ).first()
    assert accumulation.accumulated_amount == 130000


# ── T08b — multiple prizes, only the lower threshold qualifies ──────────────────

def test_t08b_two_prizes_only_lower_threshold_qualifies(db):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([
            {"prize_order": 1, "min_amount": 500000, "max_participations": 3},
            {"prize_order": 2, "min_amount": 200000, "max_participations": 5},
        ]),
    )
    participant = make_participant(db, tenant)
    invoice = make_invoice(db, tenant, cufe="CUFE-T08B", amount=300000)
    db.commit()

    result = sorteo.evaluate_participation(db, campaign, invoice, participant, None, {})

    assert result.eligible is True
    per_prize = {item["prize_order"]: item["boletas"] for item in result.rules_applied["per_prize"]}
    assert per_prize == {1: 0, 2: 1}


# ── T08c / D-005 — hard rejects (POS/date) are audited and do NOT accumulate ────

def test_t08c_pos_hard_reject_is_audited_and_not_persisted(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules(
            [{"prize_order": 1, "min_amount": 100000, "max_participations": 5}],
            pos_ids=["11111111-1111-1111-1111-111111111111"],  # no matching POS exists
        ),
    )
    participant = make_participant(db, tenant, cedula="3000000000")
    accept_terms(db, campaign, participant)
    db.commit()

    monkeypatch.setattr(
        cufe_service, "validate_cufe",
        lambda cufe, tenant_id: fake_dian_response(amount=150000, pos_nit="999999999"),
    )

    payload = ParticipationCreate(cufe="CUFE-T08C-POS", cedula="3000000000", channel="whatsapp")

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
        "cufe": "CUFE-T08C-POS",
        "participant_id": str(participant.id),
    }

    # R06b — the amount does NOT accumulate on a hard reject.
    accumulation = db.query(CampaignParticipantAccumulation).filter(
        CampaignParticipantAccumulation.campaign_id == campaign.id,
        CampaignParticipantAccumulation.participant_id == participant.id,
    ).first()
    assert accumulation is None


def test_t08c_date_hard_reject_is_audited_and_amount_does_not_accumulate(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules(
            [{"prize_order": 1, "min_amount": 100000, "max_participations": 5}],
            date_start="2026-01-01",
            date_end="2026-01-31",
        ),
    )
    participant = make_participant(db, tenant, cedula="3000000001")
    accept_terms(db, campaign, participant)
    db.commit()

    out_of_range_date = datetime(2026, 3, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(
        cufe_service, "validate_cufe",
        lambda cufe, tenant_id: fake_dian_response(amount=150000, invoice_date=out_of_range_date),
    )

    payload = ParticipationCreate(cufe="CUFE-T08C-DATE", cedula="3000000001", channel="whatsapp")

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

    accumulation = db.query(CampaignParticipantAccumulation).filter(
        CampaignParticipantAccumulation.campaign_id == campaign.id,
        CampaignParticipantAccumulation.participant_id == participant.id,
    ).first()
    assert accumulation is None


# ── T09 — duplicate CUFE within the same activity ───────────────────────────────

def test_t09_duplicate_cufe_in_same_campaign_is_rejected(db, monkeypatch):
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
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
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
    make_prize(db, campaign, order=1, quantity=1, name="Carro")
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
        rules=sorteo_rules([
            {"prize_order": 2, "min_amount": 100000, "max_participations": 10},
            {"prize_order": 1, "min_amount": 100000, "max_participations": 10},
        ]),
    )
    make_prize(db, campaign, order=2, quantity=1, name="Carro")
    make_prize(db, campaign, order=1, quantity=1, name="MasterClass")
    admin = make_admin_user(db, tenant)

    # 4 participants accumulate enough for 3, 3, 2, 2 boletas respectively —
    # both prizes share the same $100K threshold, so everyone qualifies for both.
    amounts = [300000, 300000, 200000, 200000]
    for i, amount in enumerate(amounts):
        participant = make_participant(db, tenant, cedula=f"200000000{i}")
        make_accumulation(db, campaign, participant, amount)
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
        rules=sorteo_rules([{"prize_order": 1, "min_amount": 100000, "max_participations": 5}]),
    )
    make_prize(db, campaign, order=1, quantity=1, name="Carro")
    admin = make_admin_user(db, tenant)

    participant = make_participant(db, tenant)
    make_accumulation(db, campaign, participant, 100000)
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


# ── D-006 — draw WITH replacement ────────────────────────────────────────────────

def test_d006_single_ticket_can_win_more_than_one_prize(db):
    """A pool with exactly one ticket has only one possible outcome per draw
    regardless of the seed — this only holds if the winner's entry stays in
    the pool between prizes (with replacement), proving D-006."""
    tenant = make_tenant(db)
    campaign = make_campaign(
        db, tenant,
        rules=sorteo_rules([
            {"prize_order": 2, "min_amount": 100000, "max_participations": 1},
            {"prize_order": 1, "min_amount": 100000, "max_participations": 1},
        ]),
    )
    make_prize(db, campaign, order=2, quantity=1, name="Carro")
    make_prize(db, campaign, order=1, quantity=1, name="MasterClass")
    participant = make_participant(db, tenant)
    make_accumulation(db, campaign, participant, 100000)
    db.commit()

    assignments = sorteo.select_winners(db, campaign, seed="fixed-seed-for-test")

    assert len(assignments) == 2
    assert {a.participant_id for a in assignments} == {participant.id}
    assert {a.prize_name for a in assignments} == {"Carro", "MasterClass"}
