import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.pos import POSType
from app.models.user import User
from app.schemas.pos import (
    PaginatedPOS,
    POSCreate,
    POSResponse,
    POSSimple,
    POSStatusResponse,
    POSStatusUpdate,
    POSUpdate,
)
from app.services import pos_service

router = APIRouter(prefix="/tenants", tags=["pos"])


@router.post("/{tenant_id}/pos", response_model=POSResponse, status_code=status.HTTP_201_CREATED)
def create_pos(
    tenant_id: uuid.UUID,
    payload: POSCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> POSResponse:
    return pos_service.create_pos(db, tenant_id, payload, current_user)


@router.get("/{tenant_id}/pos", response_model=PaginatedPOS)
def list_pos(
    tenant_id: uuid.UUID,
    page: int = 1,
    limit: int = 20,
    is_active: bool | None = None,
    search: str | None = None,
    pos_type: POSType | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedPOS:
    return pos_service.list_pos(db, tenant_id, current_user, page, limit, is_active, search, pos_type)


# IMPORTANT: /active must be declared before /{pos_id} to prevent FastAPI from
# attempting to parse the literal string "active" as a UUID path parameter.
@router.get("/{tenant_id}/pos/active", response_model=list[POSSimple])
def list_active_pos(
    tenant_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[POSSimple]:
    return pos_service.list_active_pos(db, tenant_id, current_user)


@router.get("/{tenant_id}/pos/{pos_id}", response_model=POSResponse)
def get_pos(
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> POSResponse:
    return pos_service.get_pos(db, tenant_id, pos_id, current_user)


@router.put("/{tenant_id}/pos/{pos_id}", response_model=POSResponse)
def update_pos(
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    payload: POSUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> POSResponse:
    return pos_service.update_pos(db, tenant_id, pos_id, payload, current_user)


@router.patch("/{tenant_id}/pos/{pos_id}/status", response_model=POSStatusResponse)
def change_pos_status(
    tenant_id: uuid.UUID,
    pos_id: uuid.UUID,
    payload: POSStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> POSStatusResponse:
    return pos_service.change_pos_status(db, tenant_id, pos_id, payload, current_user)
