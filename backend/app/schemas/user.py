import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    phone: str | None = None
    city: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    phone: str | None = None
    city: str | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    phone: str | None = None
    city: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserStatusUpdate(BaseModel):
    is_active: bool


class PaginatedUsers(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    limit: int
    pages: int
