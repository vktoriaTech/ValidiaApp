import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password_policy
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr = Field(examples=["admin@validia.co"])
    password: str = Field(examples=["Admin2026!"])


class UserSummary(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    tenant_id: uuid.UUID | None
    tenant_name: str | None
    mfa_enabled: bool = False


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserSummary


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    expires_in: int


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def check_password_policy(cls, value: str) -> str:
        return validate_password_policy(value)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def check_password_policy(cls, value: str) -> str:
        return validate_password_policy(value)


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    tenant_id: uuid.UUID | None
    tenant_name: str | None
    tenant_status: str | None
    mfa_enabled: bool = False
    last_login: datetime | None


class MFASetupResponse(BaseModel):
    secret: str
    qr_url: str
    backup_codes: list[str]


class MFAVerifyRequest(BaseModel):
    code: str
