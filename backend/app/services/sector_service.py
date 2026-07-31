import math
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.sector import Sector
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.schemas.sector import PaginatedSectors, SectorCreate, SectorResponse, SectorUpdate


def _check_super_admin(user: User) -> None:
    if user.role != UserRole.super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="No tienes permisos para realizar esta acción")


def _to_response(sector: Sector) -> SectorResponse:
    return SectorResponse.model_validate(sector)


def list_sectors(db: Session, page: int, limit: int) -> PaginatedSectors:
    query = db.query(Sector).order_by(Sector.name)
    total = query.count()
    items = query.offset((page - 1) * limit).limit(limit).all()
    return PaginatedSectors(
        items=[_to_response(s) for s in items],
        total=total, page=page, limit=limit,
        pages=math.ceil(total / limit) if total > 0 else 0,
    )


def create_sector(db: Session, payload: SectorCreate, current_user: User) -> SectorResponse:
    _check_super_admin(current_user)
    if db.query(Sector).filter(Sector.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe un sector con ese nombre")
    sector = Sector(name=payload.name)
    db.add(sector)
    db.commit()
    db.refresh(sector)
    return _to_response(sector)


def update_sector(db: Session, sector_id: uuid.UUID, payload: SectorUpdate, current_user: User) -> SectorResponse:
    _check_super_admin(current_user)
    sector = db.get(Sector, sector_id)
    if sector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sector no encontrado")
    if payload.name != sector.name and db.query(Sector).filter(Sector.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Ya existe un sector con ese nombre")
    sector.name = payload.name
    db.commit()
    db.refresh(sector)
    return _to_response(sector)


def delete_sector(db: Session, sector_id: uuid.UUID, current_user: User) -> None:
    _check_super_admin(current_user)
    sector = db.get(Sector, sector_id)
    if sector is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sector no encontrado")
    if db.query(Tenant).filter(Tenant.sector_id == sector_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="No se puede eliminar un sector con tenants asignados")
    db.delete(sector)
    db.commit()
