import uuid

from pydantic import BaseModel


class BrandCreate(BaseModel):
    name: str
    logo_url: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class BrandCategoryItem(BaseModel):
    id: uuid.UUID
    name: str


class BrandResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    logo_url: str | None
    is_active: bool
    categories: list[BrandCategoryItem] = []
    product_count: int = 0
