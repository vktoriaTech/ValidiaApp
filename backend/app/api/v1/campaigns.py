import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.campaign import ActivityType, CampaignStatus
from app.models.user import User
from app.schemas.campaign import (
    BulkVendorResponse,
    CampaignCreate,
    CampaignDetailResponse,
    CampaignPOSUpdate,
    CampaignResponse,
    CampaignStatusUpdate,
    CampaignUpdate,
    ExpenseCreate,
    ExpenseResponse,
    InventoryCreate,
    InventoryResponse,
    MercaderistaCreate,
    MercaderistaResponse,
    PaginatedCampaigns,
    PrizeCreate,
    PrizeResponse,
    PrizeUpdate,
    QRResponse,
    ResultCreate,
    ResultResponse,
    VendorCreate,
    VendorResponse,
    VendorUpdate,
)
from app.services import campaign_service

router = APIRouter(prefix="/tenants", tags=["campaigns"])


# ── Campaigns CRUD ────────────────────────────────────────────────────────────

@router.post(
    "/{tenant_id}/campaigns",
    response_model=CampaignResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_campaign(
    tenant_id: uuid.UUID,
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    return campaign_service.create_campaign(db, tenant_id, payload, current_user)


@router.get("/{tenant_id}/campaigns", response_model=PaginatedCampaigns)
def list_campaigns(
    tenant_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    status: CampaignStatus | None = None,
    activity_type: ActivityType | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedCampaigns:
    return campaign_service.list_campaigns(
        db, tenant_id, current_user, page, limit, status, activity_type, search
    )


@router.get("/{tenant_id}/campaigns/{campaign_id}", response_model=CampaignDetailResponse)
def get_campaign(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignDetailResponse:
    return campaign_service.get_campaign(db, tenant_id, campaign_id, current_user)


@router.put("/{tenant_id}/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    return campaign_service.update_campaign(db, tenant_id, campaign_id, payload, current_user)


@router.patch("/{tenant_id}/campaigns/{campaign_id}/status", response_model=CampaignResponse)
def change_campaign_status(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: CampaignStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    return campaign_service.change_campaign_status(db, tenant_id, campaign_id, payload, current_user)


@router.post("/{tenant_id}/campaigns/{campaign_id}/qr", response_model=QRResponse)
def generate_qr(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QRResponse:
    return campaign_service.generate_qr(db, tenant_id, campaign_id, current_user)


# ── Campaign POS ──────────────────────────────────────────────────────────────

@router.put("/{tenant_id}/campaigns/{campaign_id}/pos", response_model=CampaignResponse)
def update_campaign_pos(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: CampaignPOSUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CampaignResponse:
    return campaign_service.update_campaign_pos(db, tenant_id, campaign_id, payload, current_user)


# ── Prizes ────────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/campaigns/{campaign_id}/prizes", response_model=list[PrizeResponse])
def list_prizes(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PrizeResponse]:
    return campaign_service.list_prizes(db, tenant_id, campaign_id, current_user)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/prizes",
    response_model=PrizeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_prize(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: PrizeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PrizeResponse:
    return campaign_service.create_prize(db, tenant_id, campaign_id, payload, current_user)


@router.put(
    "/{tenant_id}/campaigns/{campaign_id}/prizes/{prize_id}",
    response_model=PrizeResponse,
)
def update_prize(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    prize_id: uuid.UUID,
    payload: PrizeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PrizeResponse:
    return campaign_service.update_prize(db, tenant_id, campaign_id, prize_id, payload, current_user)


@router.delete(
    "/{tenant_id}/campaigns/{campaign_id}/prizes/{prize_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_prize(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    prize_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    campaign_service.delete_prize(db, tenant_id, campaign_id, prize_id, current_user)


# ── Vendors ───────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/campaigns/{campaign_id}/vendors", response_model=list[VendorResponse])
def list_vendors(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[VendorResponse]:
    return campaign_service.list_vendors(db, tenant_id, campaign_id, current_user)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/vendors",
    response_model=VendorResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_vendor(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VendorResponse:
    return campaign_service.create_vendor(db, tenant_id, campaign_id, payload, current_user)


@router.put(
    "/{tenant_id}/campaigns/{campaign_id}/vendors/{vendor_id}",
    response_model=VendorResponse,
)
def update_vendor(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    vendor_id: uuid.UUID,
    payload: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VendorResponse:
    return campaign_service.update_vendor(db, tenant_id, campaign_id, vendor_id, payload, current_user)


@router.post("/{tenant_id}/campaigns/{campaign_id}/vendors/bulk", response_model=BulkVendorResponse)
async def bulk_upload_vendors(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkVendorResponse:
    content = await file.read()
    return campaign_service.bulk_upload_vendors(db, tenant_id, campaign_id, content, current_user)


# ── Mercaderistas ─────────────────────────────────────────────────────────────

@router.get(
    "/{tenant_id}/campaigns/{campaign_id}/mercaderistas",
    response_model=list[MercaderistaResponse],
)
def list_mercaderistas(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MercaderistaResponse]:
    return campaign_service.list_mercaderistas(db, tenant_id, campaign_id, current_user)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/mercaderistas",
    response_model=MercaderistaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_mercaderista(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: MercaderistaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MercaderistaResponse:
    return campaign_service.create_mercaderista(db, tenant_id, campaign_id, payload, current_user)


# ── Inventory ─────────────────────────────────────────────────────────────────

@router.get(
    "/{tenant_id}/campaigns/{campaign_id}/inventory",
    response_model=list[InventoryResponse],
)
def list_inventory(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InventoryResponse]:
    return campaign_service.list_inventory(db, tenant_id, campaign_id, current_user)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/inventory",
    response_model=InventoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_inventory_item(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: InventoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InventoryResponse:
    return campaign_service.create_inventory_item(db, tenant_id, campaign_id, payload, current_user)


# ── Expenses ──────────────────────────────────────────────────────────────────

@router.get(
    "/{tenant_id}/campaigns/{campaign_id}/expenses",
    response_model=list[ExpenseResponse],
)
def list_expenses(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseResponse]:
    return campaign_service.list_expenses(db, tenant_id, campaign_id, current_user)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExpenseResponse:
    return campaign_service.create_expense(db, tenant_id, campaign_id, payload, current_user)


# ── Results ───────────────────────────────────────────────────────────────────

@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/results",
    response_model=ResultResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_result(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: ResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResultResponse:
    return campaign_service.create_result(db, tenant_id, campaign_id, payload, current_user)
