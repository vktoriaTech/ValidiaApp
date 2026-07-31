import uuid

from pydantic import BaseModel


class SKUCreate(BaseModel):
    code: str
    name: str


class SKUUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    is_active: bool | None = None


class SKUResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    code: str
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class SKUFlat(BaseModel):
    sku_id: uuid.UUID
    code: str
    name: str
    product_name: str
    category_name: str | None
