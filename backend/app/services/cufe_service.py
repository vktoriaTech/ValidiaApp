import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.audit_log import AuditLog
from app.models.invoice import Invoice, ValidationStatus
from app.models.user import User, UserRole

_TIMEOUT = httpx.Timeout(90.0)
_CUFE_LENGTH = 96


def _check_access(user: User) -> None:
    if user.role == UserRole.tenant_viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción",
        )


def _extract_amount(result: dict) -> Decimal | None:
    totales = result.get("totales")
    if not isinstance(totales, dict):
        return None
    raw = totales.get("total")
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except InvalidOperation:
        return None


def _extract_invoice_date(result: dict) -> datetime | None:
    raw = result.get("fecha_emision") or (result.get("emisor") or {}).get("fecha_emision")
    if not raw:
        return None
    raw = str(raw).strip()
    # El scraper de la DIAN devuelve la fecha en formatos locales (DD/MM/YYYY,
    # DD-MM-YYYY), no ISO. Se prueban varios; fromisoformat es solo el último
    # recurso. Se toma solo la parte de fecha (los primeros 10 chars) por si
    # viene con hora.
    candidate = raw[:10]
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(candidate, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _extract_pos_nit(result: dict) -> str:
    emisor = result.get("emisor")
    if isinstance(emisor, dict):
        return str(emisor.get("nit") or "")
    return ""


def extract_invoice_fields(result: dict) -> dict:
    """Public wrapper used by participation_service to build an Invoice from
    a raw DIAN validation payload, without going through validate_and_store
    (which requires an authenticated admin user and isn't usable from the
    public participant/bot flow)."""
    return {
        "amount": _extract_amount(result),
        "invoice_date": _extract_invoice_date(result),
        "pos_nit": _extract_pos_nit(result),
    }


def validate_and_store(db: Session, tenant_id: uuid.UUID, cufe: str, nit_emisor: str, current_user: User) -> dict:
    _check_access(current_user)

    if len(cufe) != _CUFE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El CUFE debe tener {_CUFE_LENGTH} caracteres",
        )

    nit_emisor = (nit_emisor or "").strip()
    if not nit_emisor:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El NIT del emisor es obligatorio",
        )

    result = validate_cufe(cufe, nit_emisor, str(tenant_id))

    invoice_id: uuid.UUID | None = None
    if result.get("estado_dian") == "Valida":
        invoice = Invoice(
            tenant_id=tenant_id,
            participant_id=None,
            cufe=cufe,
            pos_nit=_extract_pos_nit(result),
            amount=_extract_amount(result),
            invoice_date=_extract_invoice_date(result),
            raw_data=result,
            validation_status=ValidationStatus.accepted,
        )
        db.add(invoice)
        db.flush()
        invoice_id = invoice.id

    db.add(AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.id,
        entity="cufe",
        entity_id=cufe,
        action="cufe.validated",
        payload={"estado_dian": result.get("estado_dian"), "invoice_id": str(invoice_id) if invoice_id else None},
    ))

    db.commit()

    return {**result, "invoice_id": invoice_id}


def validate_cufe(cufe: str, nit_emisor: str, tenant_id: str) -> dict:
    url = f"{settings.CUFE_SERVICE_URL.rstrip('/')}/api/v1/cufe/validar"
    headers = {"X-API-Key": settings.CUFE_SERVICE_API_KEY}

    try:
        response = httpx.post(
            url,
            json={"cufe": cufe, "nit_emisor": nit_emisor, "tenant_id": tenant_id},
            headers=headers,
            timeout=_TIMEOUT,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="El servicio de validación CUFE no respondió a tiempo",
        ) from exc
    except httpx.ConnectError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo conectar al servicio de validación CUFE",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error de comunicación con el servicio de validación CUFE: {exc}",
        ) from exc

    if response.status_code >= 500:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="El servicio de validación CUFE reportó un error interno",
        )

    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"El servicio de validación CUFE rechazó la solicitud: {detail}",
        )

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="El servicio de validación CUFE devolvió una respuesta inválida",
        ) from exc
