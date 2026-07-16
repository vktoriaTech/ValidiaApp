from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.cufe import CufeValidateRequest
from app.services import cufe_service

router = APIRouter(prefix="/cufe", tags=["cufe"])


@router.post("/validar")
def validar_cufe(
    payload: CufeValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    tenant_id = current_user.tenant_id
    if tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_id es requerido",
        )

    return cufe_service.validate_and_store(db, tenant_id, payload.cufe, current_user)
