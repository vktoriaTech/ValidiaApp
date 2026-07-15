import math
import secrets
import string
import uuid

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.core.email import send_temp_password_email
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.auth import MessageResponse
from app.schemas.user import PaginatedUsers, UserCreate, UserResponse, UserStatusUpdate, UserUpdate


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


def _generate_temp_password() -> str:
    special = "!@#$%&*"
    chars = string.ascii_lowercase + string.ascii_uppercase + string.digits + special
    password: list[str] = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice(special),
    ]
    password += [secrets.choice(chars) for _ in range(9)]
    indices = list(range(len(password)))
    for i in range(len(indices) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        indices[i], indices[j] = indices[j], indices[i]
    return "".join(password[i] for i in indices)


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


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        phone=user.phone,
        city=user.city,
        created_at=user.created_at,
    )


def _get_active_subscription(db: Session, tenant_id: uuid.UUID) -> Subscription | None:
    return (
        db.query(Subscription)
        .filter(
            Subscription.tenant_id == tenant_id,
            Subscription.status == SubscriptionStatus.active,
        )
        .order_by(Subscription.created_at.desc())
        .first()
    )


def create_user(
    db: Session,
    tenant_id: uuid.UUID,
    payload: UserCreate,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> UserResponse:
    _check_write_access(current_user, tenant_id)

    if current_user.role == UserRole.tenant_admin and payload.role == UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes asignar el rol super_admin",
        )

    tenant = db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    if db.query(User).filter(User.email == payload.email, User.tenant_id == tenant_id).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El email ya existe en este tenant",
        )

    subscription = _get_active_subscription(db, tenant_id)
    if subscription is not None:
        user_count = (
            db.query(User)
            .filter(User.tenant_id == tenant_id, User.is_active == True)  # noqa: E712
            .count()
        )
        if user_count >= subscription.max_users:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Límite de usuarios del plan alcanzado",
            )

    temp_password = _generate_temp_password()
    user = User(
        tenant_id=tenant_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(temp_password),
        is_active=True,
        must_change_password=True,
        phone=payload.phone,
        city=payload.city,
    )
    db.add(user)
    db.flush()

    _audit(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        action="user.created",
        entity="user",
        entity_id=str(user.id),
        payload={"email": user.email, "role": user.role.value},
    )

    db.commit()
    db.refresh(user)

    background_tasks.add_task(
        send_temp_password_email,
        to_email=user.email,
        full_name=user.full_name,
        temp_password=temp_password,
    )

    return _to_response(user)


def list_users(
    db: Session,
    tenant_id: uuid.UUID,
    current_user: User,
    page: int,
    limit: int,
    role_filter: UserRole | None,
    is_active_filter: bool | None,
) -> PaginatedUsers:
    _check_read_access(current_user, tenant_id)

    query = db.query(User).filter(User.tenant_id == tenant_id)
    if role_filter is not None:
        query = query.filter(User.role == role_filter)
    if is_active_filter is not None:
        query = query.filter(User.is_active == is_active_filter)

    total = query.count()
    items = query.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return PaginatedUsers(
        items=[_to_response(u) for u in items],
        total=total,
        page=page,
        limit=limit,
        pages=math.ceil(total / limit) if total > 0 else 0,
    )


def get_user(
    db: Session, tenant_id: uuid.UUID, user_id: uuid.UUID, current_user: User
) -> UserResponse:
    _check_read_access(current_user, tenant_id)
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return _to_response(user)


def update_user(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user: User,
) -> UserResponse:
    _check_write_access(current_user, tenant_id)
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if payload.role is not None and payload.role != user.role:
        if current_user.role == UserRole.tenant_admin and payload.role == UserRole.super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes asignar el rol super_admin",
            )
        old_role = user.role
        user.role = payload.role
        _audit(
            db,
            tenant_id=tenant_id,
            user_id=current_user.id,
            action="user.role_changed",
            entity="user",
            entity_id=str(user.id),
            payload={"from": old_role.value, "to": user.role.value},
        )

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.city is not None:
        user.city = payload.city

    db.commit()
    db.refresh(user)
    return _to_response(user)


def change_user_status(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    current_user: User,
) -> UserResponse:
    _check_write_access(current_user, tenant_id)
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    old_active = user.is_active
    user.is_active = payload.is_active

    _audit(
        db,
        tenant_id=tenant_id,
        user_id=current_user.id,
        action="user.status_changed",
        entity="user",
        entity_id=str(user.id),
        payload={"from": old_active, "to": payload.is_active},
    )

    db.commit()
    db.refresh(user)
    return _to_response(user)


def resend_invite(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User,
    background_tasks: BackgroundTasks,
) -> MessageResponse:
    _check_write_access(current_user, tenant_id)
    user = db.query(User).filter(User.id == user_id, User.tenant_id == tenant_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    temp_password = _generate_temp_password()
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True

    db.commit()

    background_tasks.add_task(
        send_temp_password_email,
        to_email=user.email,
        full_name=user.full_name,
        temp_password=temp_password,
    )

    return MessageResponse(message="Invitación reenviada exitosamente")
