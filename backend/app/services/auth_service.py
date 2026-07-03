from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core.email import send_password_reset_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.models.audit_log import AuditLog
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, MeResponse, RefreshResponse, UserSummary

RESET_TOKEN_EXPIRE_HOURS = 24


def _tenant_name(user: User, db: Session) -> Tenant | None:
    if user.tenant_id is None:
        return None
    return db.get(Tenant, user.tenant_id)


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario inactivo")

    if user.tenant_id is not None:
        tenant = db.get(Tenant, user.tenant_id)
        if tenant is None or tenant.status != TenantStatus.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant suspendido o inactivo",
            )

    return user


def build_user_summary(user: User, tenant: Tenant | None) -> UserSummary:
    return UserSummary(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant.name if tenant else None,
        mfa_enabled=False,
    )


def _issue_tokens(user: User) -> tuple[str, str, int]:
    tenant_id = str(user.tenant_id) if user.tenant_id else None
    access_token = create_access_token(user_id=str(user.id), tenant_id=tenant_id, role=user.role.value)
    refresh_token = create_refresh_token(user_id=str(user.id), tenant_id=tenant_id, role=user.role.value)
    expires_in = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
    return access_token, refresh_token, expires_in


def login(db: Session, payload: LoginRequest, ip_address: str | None, user_agent: str | None) -> LoginResponse:
    user = authenticate_user(db, payload.email, payload.password)

    user.last_login = datetime.now(timezone.utc)
    db.add(
        AuditLog(
            tenant_id=user.tenant_id,
            user_id=user.id,
            entity="user",
            action="login",
            payload={"ip": ip_address, "user_agent": user_agent},
            ip_address=ip_address,
        )
    )
    db.commit()
    db.refresh(user)

    tenant = _tenant_name(user, db)
    access_token, refresh_token, expires_in = _issue_tokens(user)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=build_user_summary(user, tenant),
    )


def refresh_access_token(db: Session, refresh_token: str) -> RefreshResponse:
    try:
        claims = decode_token(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    if claims.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user = db.get(User, claims.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    access_token, _, expires_in = _issue_tokens(user)
    return RefreshResponse(access_token=access_token, expires_in=expires_in)


def forgot_password(db: Session, email: str, background_tasks: BackgroundTasks) -> None:
    user = db.query(User).filter(User.email == email).first()
    if user is not None:
        raw_token, token_hash = generate_reset_token()
        user.password_reset_token = token_hash
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        db.commit()
        background_tasks.add_task(send_password_reset_email, to_email=user.email, reset_token=raw_token)


def reset_password(db: Session, token: str, new_password: str, confirm_password: str) -> None:
    if new_password != confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Las contraseñas no coinciden")

    token_hash = hash_reset_token(token)
    user = db.query(User).filter(User.password_reset_token == token_hash).first()

    now = datetime.now(timezone.utc)
    if (
        user is None
        or user.password_reset_expires is None
        or user.password_reset_expires < now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido o expirado")

    user.password_hash = hash_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.commit()


def change_password(
    db: Session, user: User, current_password: str, new_password: str, confirm_password: str
) -> None:
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contraseña actual incorrecta")

    if new_password != confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Las contraseñas no coinciden")

    user.password_hash = hash_password(new_password)
    db.commit()


def get_me(db: Session, user: User) -> MeResponse:
    tenant = _tenant_name(user, db)
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id,
        tenant_name=tenant.name if tenant else None,
        tenant_status=tenant.status.value if tenant else None,
        mfa_enabled=False,
        last_login=user.last_login,
    )
