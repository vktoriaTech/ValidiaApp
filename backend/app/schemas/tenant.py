import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.tenant import TenantStatus


class CategoryItem(BaseModel):
    id: uuid.UUID | None = None
    name: str


class BrandItem(BaseModel):
    id: uuid.UUID | None = None
    name: str


class TenantCreate(BaseModel):
    name: str
    slug: str | None = None
    nit: str
    whatsapp_number: str | None = None
    categories: list[CategoryItem] = []
    brands: list[BrandItem] = []


class TenantUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    nit: str | None = None
    whatsapp_number: str | None = None
    categories: list[CategoryItem] | None = None
    brands: list[BrandItem] | None = None


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    nit: str
    status: TenantStatus
    whatsapp_number: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionInfo(BaseModel):
    plan: str
    status: str
    ends_at: datetime | None


class TenantDetailResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    nit: str
    status: TenantStatus
    whatsapp_number: str | None
    categories: list[CategoryItem]
    brands: list[BrandItem]
    active_users: int
    subscription: SubscriptionInfo | None
    created_at: datetime


class TenantStatusUpdate(BaseModel):
    status: TenantStatus
    reason: str | None = None


class CategoriesUpdate(BaseModel):
    categories: list[CategoryItem]


class BrandsUpdate(BaseModel):
    brands: list[BrandItem]


class WhatsAppUpdate(BaseModel):
    whatsapp_number: str
    whatsapp_token: str | None = None


class PaginatedTenants(BaseModel):
    items: list[TenantResponse]
    total: int
    page: int
    limit: int
    pages: int
