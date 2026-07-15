import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db
from app.models.tenant import TenantStatus
from app.models.user import User, UserRole
from app.schemas.auth import MessageResponse
from app.schemas.tenant import (
    BrandsUpdate,
    CategoriesUpdate,
    PaginatedTenants,
    TenantCreate,
    TenantDetailResponse,
    TenantResponse,
    TenantStatusUpdate,
    TenantUpdate,
    WhatsAppUpdate,
)
from app.schemas.user import PaginatedUsers, UserCreate, UserResponse, UserStatusUpdate, UserUpdate
from app.services import tenant_service, user_service

router = APIRouter(prefix="/tenants", tags=["tenants"])


# ── Tenants ────────────────────────────────────────────────────────────────────

@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: TenantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> TenantResponse:
    return tenant_service.create_tenant(db, payload, current_user)


@router.get("", response_model=PaginatedTenants)
def list_tenants(
    page: int = 1,
    limit: int = 20,
    status: TenantStatus | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> PaginatedTenants:
    return tenant_service.list_tenants(db, current_user, page, limit, status, search)


# IMPORTANT: /me must be declared before /{tenant_id} to avoid FastAPI treating
# the literal "me" as a UUID path parameter (which would return 422).
@router.get("/me", response_model=TenantDetailResponse)
def get_my_tenant(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantDetailResponse:
    return tenant_service.get_my_tenant(db, current_user)


@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(
    tenant_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantResponse:
    return tenant_service.get_tenant(db, tenant_id, current_user)


@router.put("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: uuid.UUID,
    payload: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantResponse:
    return tenant_service.update_tenant(db, tenant_id, payload, current_user)


@router.patch("/{tenant_id}/status", response_model=TenantResponse)
def change_tenant_status(
    tenant_id: uuid.UUID,
    payload: TenantStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> TenantResponse:
    return tenant_service.change_tenant_status(db, tenant_id, payload, current_user)


# ── Tenant configuration ───────────────────────────────────────────────────────

@router.put("/{tenant_id}/categories", response_model=TenantResponse)
def update_categories(
    tenant_id: uuid.UUID,
    payload: CategoriesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantResponse:
    return tenant_service.update_categories(db, tenant_id, payload, current_user)


@router.put("/{tenant_id}/brands", response_model=TenantResponse)
def update_brands(
    tenant_id: uuid.UUID,
    payload: BrandsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantResponse:
    return tenant_service.update_brands(db, tenant_id, payload, current_user)


@router.put("/{tenant_id}/whatsapp", response_model=TenantResponse)
def update_whatsapp(
    tenant_id: uuid.UUID,
    payload: WhatsAppUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TenantResponse:
    return tenant_service.update_whatsapp(db, tenant_id, payload, current_user)


# ── Users ──────────────────────────────────────────────────────────────────────

@router.post("/{tenant_id}/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    tenant_id: uuid.UUID,
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return user_service.create_user(db, tenant_id, payload, current_user, background_tasks)


@router.get("/{tenant_id}/users", response_model=PaginatedUsers)
def list_users(
    tenant_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    role: UserRole | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedUsers:
    return user_service.list_users(db, tenant_id, current_user, page, limit, role, is_active)


@router.get("/{tenant_id}/users/{user_id}", response_model=UserResponse)
def get_user(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return user_service.get_user(db, tenant_id, user_id, current_user)


@router.put("/{tenant_id}/users/{user_id}", response_model=UserResponse)
def update_user(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return user_service.update_user(db, tenant_id, user_id, payload, current_user)


@router.patch("/{tenant_id}/users/{user_id}/status", response_model=UserResponse)
def change_user_status(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return user_service.change_user_status(db, tenant_id, user_id, payload, current_user)


@router.post("/{tenant_id}/users/{user_id}/resend-invite", response_model=MessageResponse)
def resend_invite(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    return user_service.resend_invite(db, tenant_id, user_id, current_user, background_tasks)
