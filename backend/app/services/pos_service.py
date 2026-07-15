import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.pos import POS, POSType
from app.models.user import User, UserRole
from app.schemas.pos import (
    PaginatedPOS,
    POSCreate,
    POSResponse,
    POSSimple,
    POSStatusResponse,
    POSStatusUpdate,
    POSUpdate,
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
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    entity_id: str,
    payload: dict | None = None,
) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        entity="pos",
        entity_id=entity_id,
        action=action,
        payload=payload,
    ))


def _to_response(pos: POS) -> POSResponse:
    return POSResponse(
        id=pos.id,
        tenant_id=pos.tenant_id,
        name=pos.name,
        pos_type=pos.pos_type,
        category=pos.category,
        nit_emisor=pos.nit_emisor,
        city=pos.city,
        address=pos.address,
        lat=pos.lat,
        lng=pos.lng,
        is_active=pos.is_active,
        created_at=pos.created_at,
    )


def create_pos(
    db: Session,
    tenant_id: uuid.UUID,
    payload: POSCreate,
    current_user: User,
) -> POSResponse:
    _check_write_access(current_user, tenant_id)

    pos = POS(
        tenant_id=tenant_id,
        name=payload.name,
        pos_type=payload.pos_type,
        category=payload.category,
        nit_emisor=payload.nit_emisor,
        city=payload.city,
        address=payload.address,
        lat=payload.lat,
        lng=payload.lng,
        is_active=True,
    )
    db.add(pos)
    db.flush()

    _audit(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        action="pos.created",
        entity_id=str(pos.id),
        payload={"name": pos.name, "pos_type": pos.pos_type.value, "nit_emisor": pos.nit_emisor},
    )

    db.commit()
    db.refresh(pos)
    return _to_response(pos)


def list_pos(
    db: Session,
    tenant_id: uuid.UUID,
    current_user: User,
    page: int,
    limit: int,
    is_active: bool | None,
    search: str | None,
    pos_type: POSType | None,
) -> PaginatedPOS:
    _check_read_access(current_user, tenant_id)

    query = db.query(POS).filter(POS.tenant_id == tenant_id)
    if is_active is not None:
        query = query.filter(POS.is_active == is_active)
    if search:
        query = query.filter(POS.name.ilike(f"%{search}%"))
    if pos_type is not None:
        query = query.filter(POS.pos_type == pos_type)

    total = query.count()
    items = query.order_by(POS.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return PaginatedPOS(
        items=[_to_response(p) for p in items],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total > 0 else 0,
    )


def list_active_pos(
    db: Session,
    tenant_id: uuid.UUID,
    current_user: User,
) -> list[POSSimple]:
    _check_read_access(current_user, tenant_id)

    items = (
        db.query(POS)
        .filter(POS.tenant_id == tenant_id, POS.is_active == True)  # noqa: E712
        .order_by(POS.name)
        .all()
    )
    return [POSSimple(id=p.id, name=p.name, nit_emisor=p.nit_emisor, category=p.category) for p in items]


def get_pos(
    db: Session,
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    current_user: User,
) -> POSResponse:
    _check_read_access(current_user, tenant_id)
    pos = db.query(POS).filter(POS.id == pos_id, POS.tenant_id == tenant_id).first()
    if pos is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POS no encontrado")
    return _to_response(pos)


def update_pos(
    db: Session,
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    payload: POSUpdate,
    current_user: User,
) -> POSResponse:
    _check_write_access(current_user, tenant_id)
    pos = db.query(POS).filter(POS.id == pos_id, POS.tenant_id == tenant_id).first()
    if pos is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POS no encontrado")

    changes: dict = {}
    if payload.name is not None:
        changes["name"] = payload.name
        pos.name = payload.name
    if payload.pos_type is not None:
        changes["pos_type"] = payload.pos_type.value
        pos.pos_type = payload.pos_type
    if payload.category is not None:
        changes["category"] = payload.category
        pos.category = payload.category
    if payload.nit_emisor is not None:
        changes["nit_emisor"] = payload.nit_emisor
        pos.nit_emisor = payload.nit_emisor
    if payload.city is not None:
        changes["city"] = payload.city
        pos.city = payload.city
    if payload.address is not None:
        changes["address"] = payload.address
        pos.address = payload.address
    if payload.lat is not None:
        pos.lat = payload.lat
    if payload.lng is not None:
        pos.lng = payload.lng

    _audit(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        action="pos.updated",
        entity_id=str(pos.id),
        payload=changes,
    )

    db.commit()
    db.refresh(pos)
    return _to_response(pos)


def change_pos_status(
    db: Session,
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    payload: POSStatusUpdate,
    current_user: User,
) -> POSStatusResponse:
    _check_write_access(current_user, tenant_id)
    pos = db.query(POS).filter(POS.id == pos_id, POS.tenant_id == tenant_id).first()
    if pos is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POS no encontrado")

    old_active = pos.is_active
    pos.is_active = payload.is_active

    _audit(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        action="pos.status_changed",
        entity_id=str(pos.id),
        payload={"from": old_active, "to": payload.is_active},
    )

    db.commit()
    db.refresh(pos)
    return POSStatusResponse(
        id=pos.id,
        name=pos.name,
        is_active=pos.is_active,
        updated_at=pos.updated_at,
    )
