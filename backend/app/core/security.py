import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"

PASSWORD_POLICY_MESSAGE = (
    "La contraseña debe tener mínimo 8 caracteres, al menos 1 mayúscula, "
    "1 número y 1 carácter especial"
)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_policy(password: str) -> str:
    if (
        len(password) < 8
        or not re.search(r"[A-Z]", password)
        or not re.search(r"\d", password)
        or not re.search(r"[^A-Za-z0-9]", password)
    ):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return password


def _create_token(data: dict[str, Any], expires_delta: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    to_encode = {
        **data,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(*, user_id: str, tenant_id: str | None, role: str) -> str:
    return _create_token(
        {"sub": user_id, "tenant_id": tenant_id, "role": role},
        timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        ACCESS_TOKEN_TYPE,
    )


def create_refresh_token(*, user_id: str, tenant_id: str | None, role: str) -> str:
    return _create_token(
        {"sub": user_id, "tenant_id": tenant_id, "role": role},
        timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        REFRESH_TOKEN_TYPE,
    )


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        raise ValueError("Token inválido o expirado") from exc


def generate_reset_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_reset_token(raw_token)


def hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
