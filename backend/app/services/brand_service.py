import uuid

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.brand import Brand
from app.models.brand_category import BrandCategory
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.brand import BrandCategoryItem, BrandCreate, BrandResponse, BrandUpdate
from app.schemas.brand_category import BrandCategoryCreate, BrandCategoryResponse, BrandCategoryUpdate

# ── Access helpers ─────────────────────────────────────────────────────────────

def _check_read_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")


def _check_write_access(user: User, tenant_id: uuid.UUID) -> None:
    if user.role == UserRole.super_admin:
        return
    if user.role == UserRole.tenant_viewer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")

# ── Audit helper ──────────────────────────────────────────────────────────────

def _audit(db: Session, *, tenant_id: uuid.UUID, user_id: uuid.UUID,
           action: str, entity_id: str, payload: dict | None = None) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id, user_id=user_id,
        entity="brand", entity_id=entity_id,
        action=action, payload=payload,
    ))

# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _get_brand(db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID) -> Brand:
    brand = db.query(Brand).filter(Brand.id == brand_id, Brand.tenant_id == tenant_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    return brand


def _get_category(db: Session, brand_id: uuid.UUID, category_id: uuid.UUID) -> BrandCategory:
    category = db.query(BrandCategory).filter(
        BrandCategory.id == category_id, BrandCategory.brand_id == brand_id
    ).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")
    return category

# ── Conversion helpers ────────────────────────────────────────────────────────

def _to_response(db: Session, brand: Brand) -> BrandResponse:
    categories = (
        db.query(BrandCategory)
        .filter(BrandCategory.brand_id == brand.id)
        .order_by(BrandCategory.name)
        .all()
    )
    product_count = db.query(func.count(Product.id)).filter(Product.brand_id == brand.id).scalar() or 0
    return BrandResponse(
        id=brand.id,
        tenant_id=brand.tenant_id,
        name=brand.name,
        logo_url=brand.logo_url,
        is_active=brand.is_active,
        categories=[BrandCategoryItem(id=c.id, name=c.name) for c in categories],
        product_count=product_count,
    )

# ══════════════════════════════════════════════════════════════════════════════
# Brands
# ══════════════════════════════════════════════════════════════════════════════

def list_brands(
    db: Session, tenant_id: uuid.UUID, current_user: User, is_active: bool | None
) -> list[BrandResponse]:
    _check_read_access(current_user, tenant_id)
    query = db.query(Brand).filter(Brand.tenant_id == tenant_id)
    if is_active is not None:
        query = query.filter(Brand.is_active == is_active)
    brands = query.order_by(Brand.name).all()
    return [_to_response(db, b) for b in brands]


def create_brand(
    db: Session, tenant_id: uuid.UUID, payload: BrandCreate, current_user: User
) -> BrandResponse:
    _check_write_access(current_user, tenant_id)
    if db.query(Brand).filter(Brand.tenant_id == tenant_id, Brand.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe una marca con ese nombre para este cliente")

    brand = Brand(tenant_id=tenant_id, name=payload.name, logo_url=payload.logo_url)
    db.add(brand)
    db.flush()

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="brand.created", entity_id=str(brand.id), payload={"name": brand.name})

    db.commit()
    db.refresh(brand)
    return _to_response(db, brand)


def update_brand(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, payload: BrandUpdate, current_user: User
) -> BrandResponse:
    _check_write_access(current_user, tenant_id)
    brand = _get_brand(db, tenant_id, brand_id)

    if payload.name is not None and payload.name != brand.name:
        if db.query(Brand).filter(
            Brand.tenant_id == tenant_id, Brand.name == payload.name, Brand.id != brand_id
        ).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Ya existe una marca con ese nombre para este cliente")
        brand.name = payload.name
    if payload.logo_url is not None:
        brand.logo_url = payload.logo_url
    if payload.is_active is not None:
        brand.is_active = payload.is_active

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="brand.updated", entity_id=str(brand.id), payload={"name": brand.name})

    db.commit()
    db.refresh(brand)
    return _to_response(db, brand)


def deactivate_brand(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, current_user: User
) -> None:
    _check_write_access(current_user, tenant_id)
    brand = _get_brand(db, tenant_id, brand_id)
    brand.is_active = False

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           action="brand.deactivated", entity_id=str(brand.id))

    db.commit()

# ══════════════════════════════════════════════════════════════════════════════
# Brand categories
# ══════════════════════════════════════════════════════════════════════════════

def list_categories(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, current_user: User
) -> list[BrandCategoryResponse]:
    _check_read_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    categories = (
        db.query(BrandCategory)
        .filter(BrandCategory.brand_id == brand_id)
        .order_by(BrandCategory.name)
        .all()
    )
    return [BrandCategoryResponse.model_validate(c) for c in categories]


def create_category(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID,
    payload: BrandCategoryCreate, current_user: User
) -> BrandCategoryResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    if db.query(BrandCategory).filter(
        BrandCategory.brand_id == brand_id, BrandCategory.name == payload.name
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe una categoría con ese nombre en esta marca")

    category = BrandCategory(brand_id=brand_id, name=payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return BrandCategoryResponse.model_validate(category)


def update_category(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, category_id: uuid.UUID,
    payload: BrandCategoryUpdate, current_user: User
) -> BrandCategoryResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    category = _get_category(db, brand_id, category_id)

    if payload.name != category.name and db.query(BrandCategory).filter(
        BrandCategory.brand_id == brand_id, BrandCategory.name == payload.name,
        BrandCategory.id != category_id,
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe una categoría con ese nombre en esta marca")

    category.name = payload.name
    db.commit()
    db.refresh(category)
    return BrandCategoryResponse.model_validate(category)


def delete_category(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, category_id: uuid.UUID, current_user: User
) -> None:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    category = _get_category(db, brand_id, category_id)

    if db.query(Product).filter(Product.category_id == category_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="No se puede eliminar una categoría con productos asignados")

    db.delete(category)
    db.commit()
