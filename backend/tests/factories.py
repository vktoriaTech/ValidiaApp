"""Minimal row builders for the participation/sorteo test suite."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.campaign import ActivityType, Campaign, CampaignStatus
from app.models.campaign_participant_accumulation import CampaignParticipantAccumulation
from app.models.campaign_terms_acceptance import CampaignTermsAcceptance
from app.models.invoice import Invoice, ValidationStatus
from app.models.participant import Participant
from app.models.participation import Participation
from app.models.prize import Prize
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole


def make_tenant(db: Session, **overrides) -> Tenant:
    suffix = uuid.uuid4().hex[:8]
    defaults = dict(
        name=f"Test Tenant {suffix}",
        slug=f"test-tenant-{suffix}",
        nit=f"900{uuid.uuid4().int % 10**6:06d}",
        status=TenantStatus.active,
    )
    defaults.update(overrides)
    tenant = Tenant(**defaults)
    db.add(tenant)
    db.flush()
    return tenant


def make_campaign(db: Session, tenant: Tenant, **overrides) -> Campaign:
    defaults = dict(
        tenant_id=tenant.id,
        name=f"Sorteo {uuid.uuid4().hex[:8]}",
        activity_type=ActivityType.sorteo,
        status=CampaignStatus.active,
        terms_version=1,
        rules={},
    )
    defaults.update(overrides)
    campaign = Campaign(**defaults)
    db.add(campaign)
    db.flush()
    return campaign


def make_participant(db: Session, tenant: Tenant, cedula: str | None = None, **overrides) -> Participant:
    defaults = dict(
        tenant_id=tenant.id,
        cedula=cedula or f"{uuid.uuid4().int % 10**10:010d}",
        full_name="Test Participant",
    )
    defaults.update(overrides)
    participant = Participant(**defaults)
    db.add(participant)
    db.flush()
    return participant


def accept_terms(db: Session, campaign: Campaign, participant: Participant) -> CampaignTermsAcceptance:
    acceptance = CampaignTermsAcceptance(
        tenant_id=campaign.tenant_id,
        campaign_id=campaign.id,
        participant_id=participant.id,
        terms_version=campaign.terms_version,
        channel="whatsapp",
    )
    db.add(acceptance)
    db.flush()
    return acceptance


def make_invoice(
    db: Session,
    tenant: Tenant,
    cufe: str,
    amount,
    invoice_date: datetime | None = None,
    pos_nit: str = "900123456",
) -> Invoice:
    invoice = Invoice(
        tenant_id=tenant.id,
        participant_id=None,
        cufe=cufe,
        pos_nit=pos_nit,
        amount=Decimal(str(amount)),
        invoice_date=invoice_date or datetime.now(timezone.utc),
        validation_status=ValidationStatus.accepted,
    )
    db.add(invoice)
    db.flush()
    return invoice


def make_admin_user(db: Session, tenant: Tenant, **overrides) -> User:
    defaults = dict(
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="not-a-real-hash",
        full_name="Test Admin",
        role=UserRole.tenant_admin,
        is_active=True,
    )
    defaults.update(overrides)
    user = User(**defaults)
    db.add(user)
    db.flush()
    return user


def make_participation(
    db: Session,
    campaign: Campaign,
    participant: Participant,
    invoice: Invoice,
    tickets: int,
    **overrides,
) -> Participation:
    defaults = dict(
        tenant_id=campaign.tenant_id,
        campaign_id=campaign.id,
        participant_id=participant.id,
        invoice_id=invoice.id,
        tickets=tickets,
        points=0,
        is_winner=False,
        rules_applied={"tickets_earned": tickets},
    )
    defaults.update(overrides)
    participation = Participation(**defaults)
    db.add(participation)
    db.flush()
    return participation


def make_prize(db: Session, campaign: Campaign, order: int = 1, quantity: int = 1, **overrides) -> Prize:
    defaults = dict(
        campaign_id=campaign.id,
        tenant_id=campaign.tenant_id,
        name=f"Premio {order}",
        prize_type="articulo",
        quantity=quantity,
        order=order,
    )
    defaults.update(overrides)
    prize = Prize(**defaults)
    db.add(prize)
    db.flush()
    return prize


def make_accumulation(
    db: Session, campaign: Campaign, participant: Participant, amount
) -> CampaignParticipantAccumulation:
    accumulation = CampaignParticipantAccumulation(
        tenant_id=campaign.tenant_id,
        campaign_id=campaign.id,
        participant_id=participant.id,
        accumulated_amount=Decimal(str(amount)),
    )
    db.add(accumulation)
    db.flush()
    return accumulation


def sorteo_rules(prizes: list[dict], **overrides) -> dict:
    """Build a SPEC-04C §3.2.6 `rules` dict from a list of per-prize
    eligibility entries: {prize_order, min_amount, max_participations}."""
    rules = {
        "mechanic": "acumulacion",
        "eligibility": {"type": "threshold_per_prize", "prizes": prizes},
    }
    rules.update(overrides)
    return rules


def fake_dian_response(amount, invoice_date: datetime | None = None, pos_nit: str = "900123456") -> dict:
    return {
        "estado_dian": "Valida",
        "emisor": {"nit": pos_nit},
        "totales": {"total": str(amount)},
        "fecha_emision": (invoice_date or datetime.now(timezone.utc)).isoformat(),
    }
