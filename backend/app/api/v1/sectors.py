import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.sector import PaginatedSectors, SectorCreate, SectorResponse, SectorUpdate
from app.services import sector_service

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("", response_model=PaginatedSectors)
def list_sectors(
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PaginatedSectors:
    return sector_service.list_sectors(db, page, limit)


@router.post("", response_model=SectorResponse, status_code=status.HTTP_201_CREATED)
def create_sector(
    payload: SectorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> SectorResponse:
    return sector_service.create_sector(db, payload, current_user)


@router.put("/{sector_id}", response_model=SectorResponse)
def update_sector(
    sector_id: uuid.UUID,
    payload: SectorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> SectorResponse:
    return sector_service.update_sector(db, sector_id, payload, current_user)


@router.delete("/{sector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sector(
    sector_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.super_admin)),
) -> None:
    sector_service.delete_sector(db, sector_id, current_user)
