import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.pos import POSType


class POSCreate(BaseModel):
    name: str
    pos_type: POSType
    category: str | None = None
    nit_emisor: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)


class POSUpdate(BaseModel):
    name: str | None = None
    pos_type: POSType | None = None
    category: str | None = None
    nit_emisor: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)


class POSResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    pos_type: POSType
    category: str | None
    nit_emisor: str | None
    city: str | None
    address: str | None
    lat: float | None
    lng: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class POSStatusUpdate(BaseModel):
    is_active: bool


class POSStatusResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    updated_at: datetime


class POSSimple(BaseModel):
    id: uuid.UUID
    name: str
    nit_emisor: str | None
    category: str | None


class PaginatedPOS(BaseModel):
    items: list[POSResponse]
    total: int
    page: int
    limit: int
    pages: int
