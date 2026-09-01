"""OCR de facturas con AWS Textract.

El QR impreso en la factura física no expone el CUFE de forma útil (el único
QR con datos estructurados vive dentro del PDF que genera el portal DIAN, que
solo se obtiene DESPUÉS de validar — es circular). Por eso, para el flujo de
participación se toma(n) foto(s) de la factura y se extraen por OCR el CUFE
(96 hex) y el NIT del emisor, que vienen en texto plano en el documento.

El resultado es "mejor esfuerzo": la página pública muestra los valores
detectados para que el usuario los confirme/corrija antes de participar
(el CUFE tiene 96 caracteres y un solo error de OCR invalida la búsqueda DIAN).
"""
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, status

from app.config import settings

_CUFE_LEN = 96


def _client():
    kwargs = {"region_name": settings.AWS_REGION}
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
    return boto3.client("textract", **kwargs)


def _detect_text(image_bytes: bytes) -> list[str]:
    client = _client()
    try:
        resp = client.detect_document_text(Document={"Bytes": image_bytes})
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error del servicio de OCR (Textract): {exc}",
        ) from exc
    return [b["Text"] for b in resp.get("Blocks", []) if b.get("BlockType") == "LINE"]


def _extract_cufe(text: str) -> tuple[str | None, list[str]]:
    """Busca el CUFE (96 hex). Primero cerca de la etiqueta 'CUFE' (tolerando
    saltos de línea/espacios internos que el OCR suele insertar); si no, toma
    la corrida hex más larga del documento."""
    candidates: list[str] = []

    labelled = re.search(r"CUFE[:\s]*([0-9a-fA-F\s]{96,260})", text, re.IGNORECASE)
    if labelled:
        compact = re.sub(r"\s", "", labelled.group(1))
        if len(compact) >= _CUFE_LEN:
            candidates.append(compact[:_CUFE_LEN])

    # Fallback: cualquier token hex largo (>=40) del texto, por si la etiqueta
    # no se leyó bien. Se prioriza el de longitud exacta 96.
    for token in re.findall(r"[0-9a-fA-F]{40,}", re.sub(r"\s", "", text)):
        if len(token) >= _CUFE_LEN:
            candidates.append(token[:_CUFE_LEN])
        elif token not in candidates:
            candidates.append(token)

    best = next((c for c in candidates if len(c) == _CUFE_LEN), None)
    return best, candidates


def _extract_nit(text: str) -> tuple[str | None, list[str]]:
    """Busca el NIT del emisor. En una factura hay varios NITs (emisor,
    adquirente, proveedor tecnológico). Se toleran puntos de miles y el dígito
    de verificación tras '-' (la clase `[0-9.]` se detiene antes del '-', así que
    900.061.224-9 → 900061224). Se prioriza el NIT del emisor y se descartan los
    que están junto a etiquetas de proveedor/adquirente/receptor."""
    def clean(s: str) -> str:
        return re.sub(r"[^0-9]", "", s)

    candidates: list[str] = []

    # 1) NIT rotulado explícitamente como del emisor.
    for pat in (
        r"NIT[^0-9A-Za-z]{0,4}(?:del\s*)?Emisor[^0-9]{0,8}([0-9][0-9.]{6,12})",
        r"Emisor[^0-9]{0,30}?([0-9][0-9.]{6,12})",
    ):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            d = clean(m.group(1))
            if 8 <= len(d) <= 10 and d not in candidates:
                candidates.append(d)

    # 2) Cualquier NIT, descartando los que siguen a etiquetas de un tercero
    # (proveedor tecnológico, adquirente/receptor).
    _THIRD_PARTY = ("proveedor", "tecnolog", "adquir", "receptor", "cliente")
    for m in re.finditer(r"([A-Za-z ]{0,25})NIT[^0-9]{0,8}([0-9][0-9.]{6,12})", text, re.IGNORECASE):
        prefix = (m.group(1) or "").lower()
        if any(w in prefix for w in _THIRD_PARTY):
            continue
        d = clean(m.group(2))
        if 8 <= len(d) <= 10 and d not in candidates:
            candidates.append(d)

    best = candidates[0] if candidates else None
    return best, candidates


def extract_invoice_fields(images: list[bytes]) -> dict:
    if not images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere al menos una imagen de la factura",
        )

    lines: list[str] = []
    for img in images:
        lines.extend(_detect_text(img))
    text = "\n".join(lines)

    cufe, cufe_candidates = _extract_cufe(text)
    nit, nit_candidates = _extract_nit(text)

    return {
        "cufe": cufe,
        "nit_emisor": nit,
        "cufe_candidates": cufe_candidates,
        "nit_candidates": nit_candidates,
        "raw_text": text,
    }
