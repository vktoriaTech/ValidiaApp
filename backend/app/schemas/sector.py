import uuid
from datetime import datetime

from pydantic import BaseModel


class SectorCreate(BaseModel):
    name: str


class SectorUpdate(BaseModel):
    name: str


class SectorResponse(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedSectors(BaseModel):
    items: list[SectorResponse]
    total: int
    page: int
    limit: int
    pages: int
