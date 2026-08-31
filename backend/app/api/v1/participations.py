import uuid

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.participation import (
    DrawRequest,
    DrawResponse,
    ParticipationCreate,
    ParticipationListItem,
    ParticipationResponse,
    WinnerResponse,
)
from app.services import participation_service

# Public/bot-facing — no admin auth, same pattern as POST /campaigns/{id}/terms/accept.
public_router = APIRouter(prefix="/campaigns", tags=["participations-public"])

# Admin, authenticated, tenant-scoped.
router = APIRouter(prefix="/tenants", tags=["participations"])


@public_router.post(
    "/{campaign_id}/participate-by-image",
    response_model=ParticipationResponse,
)
async def participate_by_image(
    campaign_id: uuid.UUID,
    response: Response,
    cedula: str = Form(...),
    full_name: str | None = Form(None),
    phone_wa: str | None = Form(None),
    channel: str = Form("web"),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> ParticipationResponse:
    # Flujo reutilizable web/WhatsApp: foto(s) + cédula → OCR → validar → participar.
    images = [await f.read() for f in files]
    result = participation_service.create_participation_from_images(
        db, campaign_id, images, cedula, full_name, phone_wa, channel
    )
    response.status_code = status.HTTP_201_CREATED if result.eligible else status.HTTP_200_OK
    return result


@public_router.post(
    "/{campaign_id}/participations",
    response_model=ParticipationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_participation(
    campaign_id: uuid.UUID,
    payload: ParticipationCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> ParticipationResponse:
    result = participation_service.create_participation(db, campaign_id, payload)
    # 201 when the participation earned tickets, 200 when it was recorded but
    # ineligible (SPEC-04C §6.1) — the endpoint always creates a Participation
    # row either way, only the status code communicates the outcome.
    response.status_code = status.HTTP_201_CREATED if result.eligible else status.HTTP_200_OK
    return result


@router.get(
    "/{tenant_id}/campaigns/{campaign_id}/participations",
    response_model=list[ParticipationListItem],
)
def list_participations(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    eligible: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ParticipationListItem]:
    return participation_service.list_participations(db, tenant_id, campaign_id, current_user, eligible)


@router.post(
    "/{tenant_id}/campaigns/{campaign_id}/draw",
    response_model=DrawResponse,
)
def run_draw(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    payload: DrawRequest = DrawRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DrawResponse:
    return participation_service.run_draw(db, tenant_id, campaign_id, payload, current_user)


@router.get(
    "/{tenant_id}/campaigns/{campaign_id}/winners",
    response_model=list[WinnerResponse],
)
def list_winners(
    tenant_id: uuid.UUID,
    campaign_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[WinnerResponse]:
    return participation_service.list_winners(db, tenant_id, campaign_id, current_user)
