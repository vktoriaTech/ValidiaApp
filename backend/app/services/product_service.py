import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.brand import Brand
from app.models.brand_category import BrandCategory
from app.models.product import Product
from app.models.product_sku import ProductSKU
from app.models.user import User, UserRole
from app.schemas.product import ProductCreate, ProductDetailResponse, ProductResponse, ProductUpdate
from app.schemas.product_sku import SKUCreate, SKUFlat, SKUResponse, SKUUpdate

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
           entity: str, action: str, entity_id: str, payload: dict | None = None) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id, user_id=user_id,
        entity=entity, entity_id=entity_id,
        action=action, payload=payload,
    ))

# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _get_brand(db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID) -> Brand:
    brand = db.query(Brand).filter(Brand.id == brand_id, Brand.tenant_id == tenant_id).first()
    if brand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marca no encontrada")
    return brand


def _get_product(db: Session, brand_id: uuid.UUID, product_id: uuid.UUID) -> Product:
    product = db.query(Product).filter(Product.id == product_id, Product.brand_id == brand_id).first()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return product


def _get_sku(db: Session, product_id: uuid.UUID, sku_id: uuid.UUID) -> ProductSKU:
    sku = db.query(ProductSKU).filter(ProductSKU.id == sku_id, ProductSKU.product_id == product_id).first()
    if sku is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SKU no encontrado")
    return sku


def _validate_category(db: Session, brand_id: uuid.UUID, category_id: uuid.UUID | None) -> None:
    if category_id is None:
        return
    category = db.query(BrandCategory).filter(
        BrandCategory.id == category_id, BrandCategory.brand_id == brand_id
    ).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="La categoría no pertenece a esta marca")

# ══════════════════════════════════════════════════════════════════════════════
# Products
# ══════════════════════════════════════════════════════════════════════════════

def list_products(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, current_user: User
) -> list[ProductResponse]:
    _check_read_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    products = db.query(Product).filter(Product.brand_id == brand_id).order_by(Product.name).all()
    return [ProductResponse.model_validate(p) for p in products]


def create_product(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, payload: ProductCreate, current_user: User
) -> ProductResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    _validate_category(db, brand_id, payload.category_id)

    if db.query(Product).filter(Product.brand_id == brand_id, Product.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe un producto con ese nombre en esta marca")

    product = Product(brand_id=brand_id, category_id=payload.category_id, name=payload.name)
    db.add(product)
    db.flush()

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           entity="product", action="product.created", entity_id=str(product.id),
           payload={"name": product.name})

    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


def update_product(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID,
    payload: ProductUpdate, current_user: User
) -> ProductResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    product = _get_product(db, brand_id, product_id)

    if payload.name is not None and payload.name != product.name:
        if db.query(Product).filter(
            Product.brand_id == brand_id, Product.name == payload.name, Product.id != product_id
        ).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Ya existe un producto con ese nombre en esta marca")
        product.name = payload.name
    if payload.category_id is not None:
        _validate_category(db, brand_id, payload.category_id)
        product.category_id = payload.category_id
    if payload.is_active is not None:
        product.is_active = payload.is_active

    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


def delete_product(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID, current_user: User
) -> None:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    product = _get_product(db, brand_id, product_id)
    db.delete(product)
    db.commit()

# ══════════════════════════════════════════════════════════════════════════════
# SKUs
# ══════════════════════════════════════════════════════════════════════════════

def list_skus(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID, current_user: User
) -> list[SKUResponse]:
    _check_read_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    _get_product(db, brand_id, product_id)
    skus = db.query(ProductSKU).filter(ProductSKU.product_id == product_id).order_by(ProductSKU.code).all()
    return [SKUResponse.model_validate(s) for s in skus]


def create_sku(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID,
    payload: SKUCreate, current_user: User
) -> SKUResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    product = _get_product(db, brand_id, product_id)

    if db.query(ProductSKU).filter(
        ProductSKU.product_id == product_id, ProductSKU.code == payload.code
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe un SKU con ese código en este producto")

    sku = ProductSKU(product_id=product.id, code=payload.code, name=payload.name)
    db.add(sku)
    db.flush()

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           entity="product_sku", action="product_sku.created", entity_id=str(sku.id),
           payload={"code": sku.code, "name": sku.name})

    db.commit()
    db.refresh(sku)
    return SKUResponse.model_validate(sku)


def update_sku(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID, sku_id: uuid.UUID,
    payload: SKUUpdate, current_user: User
) -> SKUResponse:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    _get_product(db, brand_id, product_id)
    sku = _get_sku(db, product_id, sku_id)

    if payload.code is not None and payload.code != sku.code:
        if db.query(ProductSKU).filter(
            ProductSKU.product_id == product_id, ProductSKU.code == payload.code,
            ProductSKU.id != sku_id,
        ).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail="Ya existe un SKU con ese código en este producto")
        sku.code = payload.code
    if payload.name is not None:
        sku.name = payload.name
    if payload.is_active is not None:
        sku.is_active = payload.is_active

    _audit(db, tenant_id=tenant_id, user_id=current_user.id,
           entity="product_sku", action="product_sku.updated", entity_id=str(sku.id),
           payload={"code": sku.code, "name": sku.name})

    db.commit()
    db.refresh(sku)
    return SKUResponse.model_validate(sku)


def delete_sku(
    db: Session, tenant_id: uuid.UUID, brand_id: uuid.UUID, product_id: uuid.UUID, sku_id: uuid.UUID,
    current_user: User
) -> None:
    _check_write_access(current_user, tenant_id)
    _get_brand(db, tenant_id, brand_id)
    _get_product(db, brand_id, product_id)
    sku = _get_sku(db, product_id, sku_id)
    db.delete(sku)
    db.commit()

# ══════════════════════════════════════════════════════════════════════════════
# Internal contracts (SPEC-05A §7) — consumed by the activity wizard (SPEC-04C)
# ══════════════════════════════════════════════════════════════════════════════

def get_brands_with_summary(db: Session, tenant_id: uuid.UUID) -> list[Brand]:
    """Marcas activas del tenant. El armado de categorías/conteo vive en brand_service._to_response."""
    return (
        db.query(Brand)
        .filter(Brand.tenant_id == tenant_id, Brand.is_active == True)  # noqa: E712
        .order_by(Brand.name)
        .all()
    )


def get_skus_for_brand(db: Session, brand_id: uuid.UUID) -> list[SKUFlat]:
    """Todos los SKUs activos de todos los productos activos de una marca."""
    rows = (
        db.query(ProductSKU, Product, BrandCategory)
        .join(Product, ProductSKU.product_id == Product.id)
        .outerjoin(BrandCategory, Product.category_id == BrandCategory.id)
        .filter(
            Product.brand_id == brand_id,
            Product.is_active == True,  # noqa: E712
            ProductSKU.is_active == True,  # noqa: E712
        )
        .order_by(Product.name, ProductSKU.code)
        .all()
    )
    return [
        SKUFlat(
            sku_id=sku.id, code=sku.code, name=sku.name,
            product_name=product.name,
            category_name=category.name if category else None,
        )
        for sku, product, category in rows
    ]
