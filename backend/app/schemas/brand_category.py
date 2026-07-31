import uuid

from pydantic import BaseModel


class BrandCategoryCreate(BaseModel):
    name: str


class BrandCategoryUpdate(BaseModel):
    name: str


class BrandCategoryResponse(BaseModel):
    id: uuid.UUID
    brand_id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}
