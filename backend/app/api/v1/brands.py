import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.brand import BrandCreate, BrandResponse, BrandUpdate
from app.schemas.brand_category import BrandCategoryCreate, BrandCategoryResponse, BrandCategoryUpdate
from app.services import brand_service

router = APIRouter(prefix="/tenants", tags=["brands"])


# ── Brands ────────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/brands", response_model=list[BrandResponse])
def list_brands(
    tenant_id: uuid.UUID,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BrandResponse]:
    return brand_service.list_brands(db, tenant_id, current_user, is_active)


@router.post("/{tenant_id}/brands", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(
    tenant_id: uuid.UUID,
    payload: BrandCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BrandResponse:
    return brand_service.create_brand(db, tenant_id, payload, current_user)


@router.put("/{tenant_id}/brands/{brand_id}", response_model=BrandResponse)
def update_brand(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BrandResponse:
    return brand_service.update_brand(db, tenant_id, brand_id, payload, current_user)


@router.delete("/{tenant_id}/brands/{brand_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_brand(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    brand_service.deactivate_brand(db, tenant_id, brand_id, current_user)


# ── Brand categories ─────────────────────────────────────────────────────────

@router.get("/{tenant_id}/brands/{brand_id}/categories", response_model=list[BrandCategoryResponse])
def list_categories(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BrandCategoryResponse]:
    return brand_service.list_categories(db, tenant_id, brand_id, current_user)


@router.post(
    "/{tenant_id}/brands/{brand_id}/categories",
    response_model=BrandCategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    payload: BrandCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BrandCategoryResponse:
    return brand_service.create_category(db, tenant_id, brand_id, payload, current_user)


@router.put(
    "/{tenant_id}/brands/{brand_id}/categories/{category_id}",
    response_model=BrandCategoryResponse,
)
def update_category(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    category_id: uuid.UUID,
    payload: BrandCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BrandCategoryResponse:
    return brand_service.update_category(db, tenant_id, brand_id, category_id, payload, current_user)


@router.delete(
    "/{tenant_id}/brands/{brand_id}/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_category(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    brand_service.delete_category(db, tenant_id, brand_id, category_id, current_user)
