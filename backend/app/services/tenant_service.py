import math
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.subscription import PLAN_MAX_USERS, Subscription, SubscriptionPlan, SubscriptionStatus
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole
from app.schemas.tenant import (
    BrandItem,
    BrandsUpdate,
    CategoryItem,
    CategoriesUpdate,
    PaginatedTenants,
    SubscriptionInfo,
    TenantCreate,
    TenantDetailResponse,
    TenantResponse,
    TenantStatusUpdate,
    TenantUpdate,
    WhatsAppUpdate,
)


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    for src, dst in [("á", "a"), ("à", "a"), ("ä", "a"), ("â", "a"),
                     ("é", "e"), ("è", "e"), ("ë", "e"), ("ê", "e"),
                     ("í", "i"), ("ì", "i"), ("ï", "i"), ("î", "i"),
                     ("ó", "o"), ("ò", "o"), ("ö", "o"), ("ô", "o"),
                     ("ú", "u"), ("ù", "u"), ("ü", "u"), ("û", "u"),
                     ("ñ", "n")]:
        slug = slug.replace(src, dst)
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug)
    return slug.strip("-")


def _check_super_admin(user: User) -> None:
    if user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )


def _check_read_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )


def _check_write_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.role == UserRole.tenant_viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )
    if user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )


def _audit(
    db: Session,
    *,
    tenant_id: uuid.UUID | None,
    user_id: uuid.UUID,
    action: str,
    entity: str,
    entity_id: str | None,
    payload: dict | None = None,
) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        entity=entity,
        entity_id=entity_id,
        action=action,
        payload=payload,
    ))


def _to_response(tenant: Tenant) -> TenantResponse:
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        nit=tenant.nit,
        status=tenant.status,
        created_at=tenant.created_at,
    )


def _build_detail(db: Session, tenant: Tenant) -> TenantDetailResponse:
    active_users = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.is_active == True)  # noqa: E712
        .count()
    )

    subscription = (
        db.query(Subscription)
        .filter(
            Subscription.tenant_id == tenant.id,
            Subscription.status == SubscriptionStatus.active,
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )

    sub_info = None
    if subscription:
        sub_info = SubscriptionInfo(
            plan=subscription.plan.value,
            status=subscription.status.value,
            ends_at=subscription.ends_at,
        )

    extra = tenant.extra_data or {}
    categories = [CategoryItem(**c) for c in extra.get("categories", [])]
    brands = [BrandItem(**b) for b in extra.get("brands", [])]

    return TenantDetailResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        nit=tenant.nit,
        status=tenant.status,
        whatsapp_number=tenant.whatsapp_number,
        categories=categories,
        brands=brands,
        active_users=active_users,
        subscription=sub_info,
        created_at=tenant.created_at,
    )


def create_tenant(db: Session, payload: TenantCreate, current_user: User) -> TenantResponse:
    _check_super_admin(current_user)

    slug = payload.slug or _slugify(payload.name)
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El slug ya existe")

    extra: dict = {}
    if payload.categories:
        extra["categories"] = [c.model_dump(exclude_none=True) for c in payload.categories]
    if payload.brands:
        extra["brands"] = [b.model_dump(exclude_none=True) for b in payload.brands]

    tenant = Tenant(
        name=payload.name,
        slug=slug,
        nit=payload.nit,
        status=TenantStatus.active,
        whatsapp_number=payload.whatsapp_number,
        extra_data=extra or None,
    )
    db.add(tenant)
    db.flush()

    now = datetime.now(timezone.utc)
    db.add(Subscription(
        tenant_id=tenant.id,
        plan=SubscriptionPlan.free_demo,
        status=SubscriptionStatus.active,
        starts_at=now,
        ends_at=now + timedelta(days=15),
        max_users=PLAN_MAX_USERS[SubscriptionPlan.free_demo],
    ))

    _audit(
        db,
        tenant_id=tenant.id,
        user_id=current_user.id,
        action="tenant.created",
        entity="tenant",
        entity_id=str(tenant.id),
        payload={"name": tenant.name, "slug": tenant.slug},
    )

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


def list_tenants(
    db: Session,
    current_user: User,
    page: int,
    limit: int,
    status_filter: TenantStatus | None,
    search: str | None,
) -> PaginatedTenants:
    _check_super_admin(current_user)

    query = db.query(Tenant)
    if status_filter is not None:
        query = query.filter(Tenant.status == status_filter)
    if search:
        query = query.filter(Tenant.name.ilike(f"%{search}%"))

    total = query.count()
    items = query.order_by(Tenant.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return PaginatedTenants(
        items=[_to_response(t) for t in items],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total > 0 else 0,
    )


def get_tenant(db: Session, tenant_id: uuid.UUID, current_user: User) -> TenantResponse:
    _check_read_access(current_user, tenant_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    return _to_response(tenant)


def update_tenant(
    db: Session, tenant_id: uuid.UUID, payload: TenantUpdate, current_user: User
) -> TenantResponse:
    _check_write_access(current_user, tenant_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    if payload.slug is not None and payload.slug != tenant.slug:
        if db.query(Tenant).filter(Tenant.slug == payload.slug).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El slug ya existe")
        tenant.slug = payload.slug

    if payload.name is not None:
        tenant.name = payload.name
    if payload.nit is not None:
        tenant.nit = payload.nit
    if payload.whatsapp_number is not None:
        tenant.whatsapp_number = payload.whatsapp_number

    extra = dict(tenant.extra_data or {})
    if payload.categories is not None:
        extra["categories"] = [c.model_dump(exclude_none=True) for c in payload.categories]
    if payload.brands is not None:
        extra["brands"] = [b.model_dump(exclude_none=True) for b in payload.brands]
    tenant.extra_data = extra or None

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


def change_tenant_status(
    db: Session, tenant_id: uuid.UUID, payload: TenantStatusUpdate, current_user: User
) -> TenantResponse:
    _check_super_admin(current_user)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    old_status = tenant.status
    tenant.status = payload.status

    _audit(
        db,
        tenant_id=tenant.id,
        user_id=current_user.id,
        action="tenant.status_changed",
        entity="tenant",
        entity_id=str(tenant.id),
        payload={"from": old_status.value, "to": payload.status.value, "reason": payload.reason},
    )

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


def get_my_tenant(db: Session, current_user: User) -> TenantDetailResponse:
    if current_user.tenant_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tienes un tenant asignado")
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    return _build_detail(db, tenant)


def update_categories(
    db: Session, tenant_id: uuid.UUID, payload: CategoriesUpdate, current_user: User
) -> TenantResponse:
    _check_write_access(current_user, tenant_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    extra = dict(tenant.extra_data or {})
    extra["categories"] = [c.model_dump(exclude_none=True) for c in payload.categories]
    tenant.extra_data = extra

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


def update_brands(
    db: Session, tenant_id: uuid.UUID, payload: BrandsUpdate, current_user: User
) -> TenantResponse:
    _check_write_access(current_user, tenant_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    extra = dict(tenant.extra_data or {})
    extra["brands"] = [b.model_dump(exclude_none=True) for b in payload.brands]
    tenant.extra_data = extra

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


def update_whatsapp(
    db: Session, tenant_id: uuid.UUID, payload: WhatsAppUpdate, current_user: User
) -> TenantResponse:
    _check_write_access(current_user, tenant_id)
    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    tenant.whatsapp_number = payload.whatsapp_number
    if payload.whatsapp_token is not None:
        tenant.whatsapp_token = payload.whatsapp_token

    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)
