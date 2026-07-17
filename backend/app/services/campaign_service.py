import csv
import io
import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.core.utils import slugify
from app.models.audit_log import AuditLog
from app.models.campaign import Campaign, CampaignStatus
from app.models.campaign_expense import CampaignExpense
from app.models.campaign_mercaderista import CampaignMercaderista
from app.models.campaign_pos import CampaignPOS
from app.models.campaign_result import CampaignResult
from app.models.campaign_vendor import CampaignVendor
from app.models.inventory_item import InventoryItem
from app.models.invoice import Invoice, ValidationStatus
from app.models.participation import Participation
from app.models.pos import POS
from app.models.prize import Prize
from app.models.user import User, UserRole
from app.schemas.campaign import (
    BulkVendorResponse,
    CampaignCreate,
    CampaignDetailResponse,
    CampaignListItem,
    CampaignPOSItem,
    CampaignPOSUpdate,
    CampaignResponse,
    CampaignStatusUpdate,
    CampaignUpdate,
    ExpenseCreate,
    ExpenseResponse,
    InventoryCreate,
    InventoryResponse,
    MercaderistaCreate,
    MercaderistaResponse,
    PaginatedCampaigns,
    PrizeCreate,
    PrizeResponse,
    PrizeUpdate,
    QRResponse,
    ResultCreate,
    ResultResponse,
    VendorCreate,
    VendorResponse,
    VendorUpdate,
)

# ── Valid state transitions ────────────────────────────────────────────────────

_VALID_TRANSITIONS: dict[CampaignStatus, set[CampaignStatus]] = {
    CampaignStatus.draft:    {CampaignStatus.active},
    CampaignStatus.active:   {CampaignStatus.paused, CampaignStatus.closed},
    CampaignStatus.paused:   {CampaignStatus.active, CampaignStatus.closed},
    CampaignStatus.closed:   {CampaignStatus.archived},
    CampaignStatus.archived: set(),
}

# ── Access helpers ─────────────────────────────────────────────────────────────

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

def _audit(db: Session, *, tenant_id: uuid.UUID, user_id: uuid.UUID,
           action: str, entity_id: str, payload: dict | None = None) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id, user_id=user_id,
        entity="campaign", entity_id=entity_id,
        action=action, payload=payload,
    ))

# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _get_campaign(db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.tenant_id == tenant_id
    ).first()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Campaña no encontrada")
    return campaign


def _require_draft(campaign: Campaign) -> None:
    if campaign.status != CampaignStatus.draft:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Solo se pueden editar campañas en estado draft")

# ── Conversion helpers ────────────────────────────────────────────────────────

def _to_response(campaign: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=campaign.id,
        tenant_id=campaign.tenant_id,
        name=campaign.name,
        activity_type=campaign.activity_type,
        status=campaign.status,
        qr_code=campaign.qr_code,
        qr_slug=campaign.qr_slug,
        created_at=campaign.created_at,
    )


def _pos_items(db: Session, campaign_id: uuid.UUID) -> list[CampaignPOSItem]:
    rows = (
        db.query(CampaignPOS, POS)
        .join(POS, CampaignPOS.pos_id == POS.id)
        .filter(CampaignPOS.campaign_id == campaign_id)
        .all()
    )
    return [
        CampaignPOSItem(id=pos.id, name=pos.name,
                        nit_emisor=pos.nit_emisor, category=pos.category)
        for _, pos in rows
    ]


def _prize_responses(db: Session, campaign_id: uuid.UUID) -> list[PrizeResponse]:
    prizes = db.query(Prize).filter(Prize.campaign_id == campaign_id).order_by(Prize.order).all()
    return [PrizeResponse.model_validate(p) for p in prizes]


def _participation_counts(db: Session, campaign_ids: list[uuid.UUID]) -> tuple[dict, dict]:
    """Return (total_participations, accepted_invoice_counts) dicts keyed by campaign_id."""
    if not campaign_ids:
        return {}, {}

    totals = dict(
        db.query(Participation.campaign_id, func.count(Participation.id))
        .filter(Participation.campaign_id.in_(campaign_ids))
        .group_by(Participation.campaign_id)
        .all()
    )
    accepted = dict(
        db.query(Participation.campaign_id, func.count(Participation.id))
        .join(Invoice, Participation.invoice_id == Invoice.id)
        .filter(
            Participation.campaign_id.in_(campaign_ids),
            Invoice.validation_status == ValidationStatus.accepted,
        )
        .group_by(Participation.campaign_id)
        .all()
    )
    return totals, accepted


def _rejected_count(db: Session, campaign_id: uuid.UUID) -> int:
    return (
        db.query(func.count(Participation.id))
        .join(Invoice, Participation.invoice_id == Invoice.id)
        .filter(
            Participation.campaign_id == campaign_id,
            Invoice.validation_status == ValidationStatus.rejected,
        )
        .scalar() or 0
    )

# ── QR generation ─────────────────────────────────────────────────────────────

def _generate_qr_slug(db: Session, name: str) -> str:
    base = slugify(name)
    slug = base
    counter = 2
    while db.query(Campaign).filter(Campaign.qr_slug == slug).first():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _apply_qr(db: Session, campaign: Campaign) -> QRResponse:
    slug = _generate_qr_slug(db, campaign.name)
    qr_url = f"{settings.FRONTEND_URL}/c/{slug}"
    campaign.qr_slug = slug
    campaign.qr_url = qr_url
    campaign.qr_code = None  # image generation deferred
    return QRResponse(qr_code=None, qr_slug=slug, qr_url=qr_url)

# ── POS validation helper ─────────────────────────────────────────────────────

def _sync_campaign_pos(
    db: Session, campaign: Campaign, pos_ids: list[uuid.UUID]
) -> None:
    if not pos_ids:
        db.query(CampaignPOS).filter(CampaignPOS.campaign_id == campaign.id).delete()
        return

    valid = {
        p.id for p in db.query(POS).filter(
            POS.id.in_(pos_ids), POS.tenant_id == campaign.tenant_id
        ).all()
    }
    invalid = set(pos_ids) - valid
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"POS no encontrados o de otro tenant: {[str(i) for i in invalid]}",
        )

    db.query(CampaignPOS).filter(CampaignPOS.campaign_id == campaign.id).delete()
    for pid in valid:
        db.add(CampaignPOS(campaign_id=campaign.id, tenant_id=campaign.tenant_id, pos_id=pid))


def _sync_prizes(db: Session, campaign: Campaign, prizes: list[PrizeCreate]) -> None:
    db.query(Prize).filter(Prize.campaign_id == campaign.id).delete()
    for p in prizes:
        db.add(Prize(
            campaign_id=campaign.id,
            tenant_id=campaign.tenant_id,
            name=p.name,
            description=p.description,
            prize_type=p.prize_type,
            quantity=p.quantity,
            order=p.order,
        ))

# ══════════════════════════════════════════════════════════════════════════════
# Campaign CRUD
# ══════════════════════════════════════════════════════════════════════════════

def create_campaign(
    db: Session, tenant_id: uuid.UUID, payload: CampaignCreate, current_user: User
) -> CampaignResponse:
    _check_write_access(current_user, tenant_id)

    campaign = Campaign(
        tenant_id=tenant_id,
        name=payload.name,
        description=payload.description,
        activity_type=payload.activity_type,
        status=CampaignStatus.draft,
        objective_type=payload.objective_type,
        objective_value=payload.objective_value,
        budget=payload.budget,
        category=payload.category,
        brand=payload.brand,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        start_time=payload.start_time,
        end_time=payload.end_time,
        raffle_at=payload.raffle_at,
        participation_method=payload.participation_method,
        closure_type=payload.closure_type,
        terms_text=payload.terms_text,
        rules=payload.rules,
    )
    db.add(campaign)
    db.flush()

    if payload.prizes:
        _sync_prizes(db, campaign, payload.prizes)
    if payload.pos_ids:
        _sync_campaign_pos(db, campaign, payload.pos_ids)

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.created", entity_id=str(campaign.id),
           payload={"name": campaign.name, "activity_type": campaign.activity_type.value if campaign.activity_type else None})

    db.commit()
    db.refresh(campaign)
    return _to_response(campaign)


def list_campaigns(
    db: Session,
    tenant_id: uuid.UUID,
    current_user: User,
    page: int,
    limit: int,
    status_filter: CampaignStatus | None,
    activity_type_filter: str | None,
    search: str | None,
) -> PaginatedCampaigns:
    _check_read_access(current_user, tenant_id)

    query = db.query(Campaign).filter(Campaign.tenant_id == tenant_id)
    if status_filter:
        query = query.filter(Campaign.status == status_filter)
    if activity_type_filter:
        query = query.filter(Campaign.activity_type == activity_type_filter)
    if search:
        query = query.filter(Campaign.name.ilike(f"%{search}%"))

    total = query.count()
    campaigns = (
        query.order_by(Campaign.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    ids = [c.id for c in campaigns]
    totals, accepted = _participation_counts(db, ids)

    items = [
        CampaignListItem(
            id=c.id,
            name=c.name,
            activity_type=c.activity_type,
            status=c.status,
            starts_at=c.starts_at,
            ends_at=c.ends_at,
            total_participations=totals.get(c.id, 0),
            total_invoices_accepted=accepted.get(c.id, 0),
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in campaigns
    ]
    return PaginatedCampaigns(
        items=items, total=total, page=page, limit=limit,
        pages=math.ceil(total / limit) if total > 0 else 0,
    )


def get_campaign(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> CampaignDetailResponse:
    _check_read_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)

    totals, accepted = _participation_counts(db, [campaign_id])
    vendors = db.query(CampaignVendor).filter(CampaignVendor.campaign_id == campaign_id).all()
    mercs = db.query(CampaignMercaderista).filter(CampaignMercaderista.campaign_id == campaign_id).all()

    return CampaignDetailResponse(
        id=campaign.id,
        tenant_id=campaign.tenant_id,
        name=campaign.name,
        description=campaign.description,
        activity_type=campaign.activity_type,
        status=campaign.status,
        objective_type=campaign.objective_type,
        objective_value=campaign.objective_value,
        budget=campaign.budget,
        category=campaign.category,
        brand=campaign.brand,
        starts_at=campaign.starts_at,
        ends_at=campaign.ends_at,
        start_time=campaign.start_time,
        end_time=campaign.end_time,
        raffle_at=campaign.raffle_at,
        participation_method=campaign.participation_method,
        closure_type=campaign.closure_type,
        terms_text=campaign.terms_text,
        rules=campaign.rules,
        qr_code=campaign.qr_code,
        qr_slug=campaign.qr_slug,
        qr_url=campaign.qr_url,
        created_at=campaign.created_at,
        pos=_pos_items(db, campaign_id),
        prizes=_prize_responses(db, campaign_id),
        vendors=[VendorResponse.model_validate(v) for v in vendors],
        mercaderistas=[MercaderistaResponse.model_validate(m) for m in mercs],
        total_participations=totals.get(campaign_id, 0),
        total_invoices_accepted=accepted.get(campaign_id, 0),
        total_invoices_rejected=_rejected_count(db, campaign_id),
    )


def update_campaign(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: CampaignUpdate, current_user: User
) -> CampaignResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)
    _require_draft(campaign)

    if payload.name is not None:          campaign.name = payload.name
    if payload.description is not None:   campaign.description = payload.description
    if payload.activity_type is not None: campaign.activity_type = payload.activity_type
    if payload.objective_type is not None: campaign.objective_type = payload.objective_type
    if payload.objective_value is not None: campaign.objective_value = payload.objective_value
    if payload.budget is not None:        campaign.budget = payload.budget
    if payload.category is not None:      campaign.category = payload.category
    if payload.brand is not None:         campaign.brand = payload.brand
    if payload.starts_at is not None:     campaign.starts_at = payload.starts_at
    if payload.ends_at is not None:       campaign.ends_at = payload.ends_at
    if payload.start_time is not None:    campaign.start_time = payload.start_time
    if payload.end_time is not None:      campaign.end_time = payload.end_time
    if payload.raffle_at is not None:     campaign.raffle_at = payload.raffle_at
    if payload.participation_method is not None: campaign.participation_method = payload.participation_method
    if payload.closure_type is not None:  campaign.closure_type = payload.closure_type
    if payload.terms_text is not None:    campaign.terms_text = payload.terms_text
    if payload.rules is not None:         campaign.rules = payload.rules

    if payload.prizes is not None:
        _sync_prizes(db, campaign, payload.prizes)
    if payload.pos_ids is not None:
        _sync_campaign_pos(db, campaign, payload.pos_ids)

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.updated", entity_id=str(campaign.id),
           payload={"name": campaign.name})

    db.commit()
    db.refresh(campaign)
    return _to_response(campaign)


def change_campaign_status(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: CampaignStatusUpdate, current_user: User
) -> CampaignResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)

    if payload.status not in _VALID_TRANSITIONS.get(campaign.status, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transición inválida: {campaign.status} → {payload.status}",
        )

    # draft → active: requires dates, at least 1 POS and 1 prize
    if campaign.status == CampaignStatus.draft and payload.status == CampaignStatus.active:
        if not campaign.starts_at or not campaign.ends_at:
            raise HTTPException(status_code=400, detail="La campaña debe tener fechas de inicio y fin")
        pos_count = db.query(func.count(CampaignPOS.id)).filter(CampaignPOS.campaign_id == campaign_id).scalar()
        if not pos_count:
            raise HTTPException(status_code=400, detail="La campaña debe tener al menos 1 POS asociado")
        prize_count = db.query(func.count(Prize.id)).filter(Prize.campaign_id == campaign_id).scalar()
        if not prize_count:
            raise HTTPException(status_code=400, detail="La campaña debe tener al menos 1 premio")
        # Generate QR on activation
        _apply_qr(db, campaign)
        _audit(db, tenant_id=tenant_id, user_id=current_user.id,
               action="campaign.qr_generated", entity_id=str(campaign.id),
               payload={"qr_slug": campaign.qr_slug})

    # closed → archived: requires at least 1 winner
    if campaign.status == CampaignStatus.closed and payload.status == CampaignStatus.archived:
        has_winner = db.query(Participation).filter(
            Participation.campaign_id == campaign_id,
            Participation.is_winner == True,  # noqa: E712
        ).first()
        if not has_winner:
            raise HTTPException(status_code=400, detail="La campaña debe tener al menos 1 ganador registrado")

    old_status = campaign.status
    campaign.status = payload.status

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.status_changed", entity_id=str(campaign.id),
           payload={"from": old_status.value, "to": payload.status.value, "reason": payload.reason})

    db.commit()
    db.refresh(campaign)
    return _to_response(campaign)


def generate_qr(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> QRResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)

    # If slug already set, reuse it with a fresh URL
    if campaign.qr_slug:
        qr_url = f"{settings.FRONTEND_URL}/c/{campaign.qr_slug}"
        campaign.qr_url = qr_url
    else:
        _apply_qr(db, campaign)

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.qr_generated", entity_id=str(campaign.id),
           payload={"qr_slug": campaign.qr_slug})

    db.commit()
    db.refresh(campaign)
    return QRResponse(qr_code=campaign.qr_code, qr_slug=campaign.qr_slug, qr_url=campaign.qr_url)

# ── Campaign POS ──────────────────────────────────────────────────────────────

def update_campaign_pos(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: CampaignPOSUpdate, current_user: User
) -> CampaignResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)

    if payload.all_pos:
        pos_ids = [p.id for p in db.query(POS).filter(
            POS.tenant_id == tenant_id, POS.is_active == True  # noqa: E712
        ).all()]
    else:
        pos_ids = payload.pos_ids

    _sync_campaign_pos(db, campaign, pos_ids)
    db.commit()
    db.refresh(campaign)
    return _to_response(campaign)

# ── Prizes ────────────────────────────────────────────────────────────────────

def list_prizes(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[PrizeResponse]:
    _check_read_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    return _prize_responses(db, campaign_id)


def create_prize(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: PrizeCreate, current_user: User
) -> PrizeResponse:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)
    prize = Prize(
        campaign_id=campaign.id, tenant_id=tenant_id,
        name=payload.name, description=payload.description,
        prize_type=payload.prize_type, quantity=payload.quantity, order=payload.order,
    )
    db.add(prize)
    db.commit()
    db.refresh(prize)
    return PrizeResponse.model_validate(prize)


def update_prize(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    prize_id: uuid.UUID, payload: PrizeUpdate, current_user: User
) -> PrizeResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    prize = db.query(Prize).filter(Prize.id == prize_id, Prize.campaign_id == campaign_id).first()
    if prize is None:
        raise HTTPException(status_code=404, detail="Premio no encontrado")
    if payload.name is not None:        prize.name = payload.name
    if payload.description is not None: prize.description = payload.description
    if payload.prize_type is not None:  prize.prize_type = payload.prize_type
    if payload.quantity is not None:    prize.quantity = payload.quantity
    if payload.order is not None:       prize.order = payload.order
    db.commit()
    db.refresh(prize)
    return PrizeResponse.model_validate(prize)


def delete_prize(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    prize_id: uuid.UUID, current_user: User
) -> None:
    _check_write_access(current_user, tenant_id)
    campaign = _get_campaign(db, tenant_id, campaign_id)
    _require_draft(campaign)
    prize = db.query(Prize).filter(Prize.id == prize_id, Prize.campaign_id == campaign_id).first()
    if prize is None:
        raise HTTPException(status_code=404, detail="Premio no encontrado")
    db.delete(prize)
    db.commit()

# ── Vendors ───────────────────────────────────────────────────────────────────

def list_vendors(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[VendorResponse]:
    _check_read_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    vendors = db.query(CampaignVendor).filter(CampaignVendor.campaign_id == campaign_id).all()
    return [VendorResponse.model_validate(v) for v in vendors]


def create_vendor(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: VendorCreate, current_user: User
) -> VendorResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    vendor = CampaignVendor(
        campaign_id=campaign_id, tenant_id=tenant_id,
        full_name=payload.full_name, cedula=payload.cedula,
        address=payload.address, city=payload.city,
        email=payload.email, phone=payload.phone,
        client_key=payload.client_key, client_name=payload.client_name,
    )
    db.add(vendor)
    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.vendor_added", entity_id=str(campaign_id),
           payload={"cedula": payload.cedula, "full_name": payload.full_name})
    db.commit()
    db.refresh(vendor)
    return VendorResponse.model_validate(vendor)


def update_vendor(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    vendor_id: uuid.UUID, payload: VendorUpdate, current_user: User
) -> VendorResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    vendor = db.query(CampaignVendor).filter(
        CampaignVendor.id == vendor_id, CampaignVendor.campaign_id == campaign_id
    ).first()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    if payload.full_name is not None:   vendor.full_name = payload.full_name
    if payload.address is not None:     vendor.address = payload.address
    if payload.city is not None:        vendor.city = payload.city
    if payload.email is not None:       vendor.email = payload.email
    if payload.phone is not None:       vendor.phone = payload.phone
    if payload.client_key is not None:  vendor.client_key = payload.client_key
    if payload.client_name is not None: vendor.client_name = payload.client_name
    db.commit()
    db.refresh(vendor)
    return VendorResponse.model_validate(vendor)


def bulk_upload_vendors(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    file_content: bytes, current_user: User
) -> BulkVendorResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)

    created = updated = 0
    errors: list[str] = []

    try:
        text = file_content.decode("utf-8-sig")  # handle BOM if present
    except UnicodeDecodeError:
        text = file_content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    for row_num, row in enumerate(reader, start=2):
        try:
            cedula = (row.get("cedula") or "").strip()
            if not cedula:
                errors.append(f"Fila {row_num}: cédula requerida")
                continue
            full_name = (row.get("full_name") or "").strip()
            if not full_name:
                errors.append(f"Fila {row_num}: full_name requerido")
                continue

            existing = db.query(CampaignVendor).filter(
                CampaignVendor.campaign_id == campaign_id,
                CampaignVendor.cedula == cedula,
            ).first()

            data = dict(
                full_name=full_name,
                address=(row.get("address") or "").strip() or None,
                city=(row.get("city") or "").strip() or None,
                email=(row.get("email") or "").strip() or None,
                phone=(row.get("phone") or "").strip() or None,
                client_key=(row.get("client_key") or "").strip() or None,
                client_name=(row.get("client_name") or "").strip() or None,
            )

            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(CampaignVendor(campaign_id=campaign_id, tenant_id=tenant_id,
                                      cedula=cedula, **data))
                created += 1
        except Exception as exc:
            errors.append(f"Fila {row_num}: {exc}")

    db.commit()
    return BulkVendorResponse(created=created, updated=updated, errors=errors)

# ── Mercaderistas ─────────────────────────────────────────────────────────────

def list_mercaderistas(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[MercaderistaResponse]:
    _check_read_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    mercs = db.query(CampaignMercaderista).filter(
        CampaignMercaderista.campaign_id == campaign_id
    ).all()
    return [MercaderistaResponse.model_validate(m) for m in mercs]


def create_mercaderista(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: MercaderistaCreate, current_user: User
) -> MercaderistaResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    merc = CampaignMercaderista(
        campaign_id=campaign_id, tenant_id=tenant_id,
        full_name=payload.full_name, cedula=payload.cedula,
        email=payload.email, phone=payload.phone,
    )
    db.add(merc)
    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="campaign.mercaderista_added", entity_id=str(campaign_id),
           payload={"cedula": payload.cedula, "full_name": payload.full_name})
    db.commit()
    db.refresh(merc)
    return MercaderistaResponse.model_validate(merc)

# ── Inventory ─────────────────────────────────────────────────────────────────

def list_inventory(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[InventoryResponse]:
    _check_read_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    items = db.query(InventoryItem).filter(InventoryItem.campaign_id == campaign_id).all()
    return [
        InventoryResponse(
            id=i.id, article_name=i.article_name, description=i.description,
            total_units=i.total_units, delivered_units=i.delivered_units,
            available_units=max(i.total_units - i.delivered_units, 0),
            created_at=i.created_at,
        )
        for i in items
    ]


def create_inventory_item(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: InventoryCreate, current_user: User
) -> InventoryResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    item = InventoryItem(
        campaign_id=campaign_id, tenant_id=tenant_id,
        article_name=payload.article_name, description=payload.description,
        total_units=payload.total_units,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return InventoryResponse(
        id=item.id, article_name=item.article_name, description=item.description,
        total_units=item.total_units, delivered_units=item.delivered_units,
        available_units=max(item.total_units - item.delivered_units, 0),
        created_at=item.created_at,
    )

# ── Expenses ──────────────────────────────────────────────────────────────────

def list_expenses(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID, current_user: User
) -> list[ExpenseResponse]:
    _check_read_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    return [
        ExpenseResponse.model_validate(e)
        for e in db.query(CampaignExpense).filter(CampaignExpense.campaign_id == campaign_id).all()
    ]


def create_expense(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: ExpenseCreate, current_user: User
) -> ExpenseResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    expense = CampaignExpense(
        campaign_id=campaign_id, tenant_id=tenant_id,
        supplier_name=payload.supplier_name, amount=payload.amount,
        description=payload.description, invoice_number=payload.invoice_number,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return ExpenseResponse.model_validate(expense)

# ── Results ───────────────────────────────────────────────────────────────────

def create_result(
    db: Session, tenant_id: uuid.UUID, campaign_id: uuid.UUID,
    payload: ResultCreate, current_user: User
) -> ResultResponse:
    _check_write_access(current_user, tenant_id)
    _get_campaign(db, tenant_id, campaign_id)
    result = CampaignResult(
        campaign_id=campaign_id, tenant_id=tenant_id,
        result_value=payload.result_value, description=payload.description,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return ResultResponse.model_validate(result)
