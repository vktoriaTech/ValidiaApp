import uuid

from pydantic import BaseModel

from app.schemas.product_sku import SKUResponse


class ProductCreate(BaseModel):
    name: str
    category_id: uuid.UUID | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    category_id: uuid.UUID | None = None
    is_active: bool | None = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    category_id: uuid.UUID | None
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class ProductDetailResponse(ProductResponse):
    skus: list[SKUResponse] = []
