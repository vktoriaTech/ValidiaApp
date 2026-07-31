import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate
from app.schemas.product_sku import SKUCreate, SKUResponse, SKUUpdate
from app.services import product_service

router = APIRouter(prefix="/tenants", tags=["products"])


# ── Products ──────────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/brands/{brand_id}/products", response_model=list[ProductResponse])
def list_products(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ProductResponse]:
    return product_service.list_products(db, tenant_id, brand_id, current_user)


@router.post(
    "/{tenant_id}/brands/{brand_id}/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProductResponse:
    return product_service.create_product(db, tenant_id, brand_id, payload, current_user)


@router.put("/{tenant_id}/brands/{brand_id}/products/{product_id}", response_model=ProductResponse)
def update_product(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProductResponse:
    return product_service.update_product(db, tenant_id, brand_id, product_id, payload, current_user)


@router.delete(
    "/{tenant_id}/brands/{brand_id}/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    product_service.delete_product(db, tenant_id, brand_id, product_id, current_user)


# ── SKUs ──────────────────────────────────────────────────────────────────────

@router.get(
    "/{tenant_id}/brands/{brand_id}/products/{product_id}/skus",
    response_model=list[SKUResponse],
)
def list_skus(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SKUResponse]:
    return product_service.list_skus(db, tenant_id, brand_id, product_id, current_user)


@router.post(
    "/{tenant_id}/brands/{brand_id}/products/{product_id}/skus",
    response_model=SKUResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_sku(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: SKUCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SKUResponse:
    return product_service.create_sku(db, tenant_id, brand_id, product_id, payload, current_user)


@router.put(
    "/{tenant_id}/brands/{brand_id}/products/{product_id}/skus/{sku_id}",
    response_model=SKUResponse,
)
def update_sku(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    sku_id: uuid.UUID,
    payload: SKUUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SKUResponse:
    return product_service.update_sku(db, tenant_id, brand_id, product_id, sku_id, payload, current_user)


@router.delete(
    "/{tenant_id}/brands/{brand_id}/products/{product_id}/skus/{sku_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_sku(
    tenant_id: uuid.UUID,
    brand_id: uuid.UUID,
    product_id: uuid.UUID,
    sku_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    product_service.delete_sku(db, tenant_id, brand_id, product_id, sku_id, current_user)
