import uuid
from datetime import datetime, time
from decimal import Decimal

from pydantic import BaseModel

from app.models.campaign import ActivityType, CampaignStatus


# ── Prizes ────────────────────────────────────────────────────────────────────

class PrizeCreate(BaseModel):
    name: str
    description: str | None = None
    prize_type: str = "articulo"
    quantity: int = 1
    order: int = 1


class PrizeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    prize_type: str | None = None
    quantity: int | None = None
    order: int | None = None


class PrizeResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    name: str
    description: str | None
    prize_type: str
    quantity: int
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── POS association ────────────────────────────────────────────────────────────

class CampaignPOSItem(BaseModel):
    id: uuid.UUID
    name: str
    nit_emisor: str | None
    category: str | None


class CampaignPOSUpdate(BaseModel):
    pos_ids: list[uuid.UUID] = []
    all_pos: bool = False


# ── Campaigns ─────────────────────────────────────────────────────────────────

class CampaignCreate(BaseModel):
    name: str
    description: str | None = None
    activity_type: ActivityType
    objective_type: str | None = None
    objective_value: Decimal | None = None
    budget: Decimal | None = None
    category: str | None = None
    brand: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    start_time: time | None = None
    end_time: time | None = None
    raffle_at: datetime | None = None
    participation_method: str | None = None
    closure_type: str | None = None
    terms_text: str | None = None
    rules: list | None = None
    pos_ids: list[uuid.UUID] = []
    prizes: list[PrizeCreate] = []


class CampaignUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    activity_type: ActivityType | None = None
    objective_type: str | None = None
    objective_value: Decimal | None = None
    budget: Decimal | None = None
    category: str | None = None
    brand: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    start_time: time | None = None
    end_time: time | None = None
    raffle_at: datetime | None = None
    participation_method: str | None = None
    closure_type: str | None = None
    terms_text: str | None = None
    rules: list | None = None
    pos_ids: list[uuid.UUID] | None = None
    prizes: list[PrizeCreate] | None = None


class CampaignStatusUpdate(BaseModel):
    status: CampaignStatus
    reason: str | None = None


class CampaignResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    activity_type: ActivityType | None
    status: CampaignStatus
    qr_code: str | None
    qr_slug: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CampaignListItem(BaseModel):
    id: uuid.UUID
    name: str
    activity_type: ActivityType | None
    status: CampaignStatus
    starts_at: datetime | None
    ends_at: datetime | None
    total_participations: int
    total_invoices_accepted: int
    created_at: datetime
    updated_at: datetime


class PaginatedCampaigns(BaseModel):
    items: list[CampaignListItem]
    total: int
    page: int
    limit: int
    pages: int


class CampaignDetailResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    activity_type: ActivityType | None
    status: CampaignStatus
    objective_type: str | None
    objective_value: Decimal | None
    budget: Decimal | None
    category: str | None
    brand: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    start_time: time | None
    end_time: time | None
    raffle_at: datetime | None
    participation_method: str | None
    closure_type: str | None
    terms_text: str | None
    rules: list | None
    qr_code: str | None
    qr_slug: str | None
    qr_url: str | None
    created_at: datetime
    pos: list[CampaignPOSItem]
    prizes: list[PrizeResponse]
    vendors: list["VendorResponse"]
    mercaderistas: list["MercaderistaResponse"]
    total_participations: int
    total_invoices_accepted: int
    total_invoices_rejected: int


class QRResponse(BaseModel):
    qr_code: str | None
    qr_slug: str
    qr_url: str


# ── Vendors ───────────────────────────────────────────────────────────────────

class VendorCreate(BaseModel):
    full_name: str
    cedula: str
    address: str | None = None
    city: str | None = None
    email: str | None = None
    phone: str | None = None
    client_key: str | None = None
    client_name: str | None = None


class VendorUpdate(BaseModel):
    full_name: str | None = None
    address: str | None = None
    city: str | None = None
    email: str | None = None
    phone: str | None = None
    client_key: str | None = None
    client_name: str | None = None


class VendorResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    full_name: str
    cedula: str
    address: str | None
    city: str | None
    email: str | None
    phone: str | None
    client_key: str | None
    client_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BulkVendorResponse(BaseModel):
    created: int
    updated: int
    errors: list[str] = []


# ── Mercaderistas ─────────────────────────────────────────────────────────────

class MercaderistaCreate(BaseModel):
    full_name: str
    cedula: str
    email: str | None = None
    phone: str | None = None


class MercaderistaResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    full_name: str
    cedula: str
    email: str | None
    phone: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Inventory ─────────────────────────────────────────────────────────────────

class InventoryCreate(BaseModel):
    article_name: str
    description: str | None = None
    total_units: int


class InventoryResponse(BaseModel):
    id: uuid.UUID
    article_name: str
    description: str | None
    total_units: int
    available_units: int
    delivered_units: int
    created_at: datetime


# ── Expenses ──────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    supplier_name: str
    amount: Decimal
    description: str | None = None
    invoice_number: str | None = None


class ExpenseResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    supplier_name: str
    amount: Decimal
    description: str | None
    invoice_number: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Results ───────────────────────────────────────────────────────────────────

class ResultCreate(BaseModel):
    result_value: Decimal
    description: str | None = None


class ResultResponse(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    result_value: Decimal
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# Forward refs
CampaignDetailResponse.model_rebuild()
