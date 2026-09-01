"""Almacenamiento de evidencias en S3 (DT-006).

Guarda de forma durable el PDF oficial de la DIAN y la(s) foto(s) que sube el
participante. Es "mejor esfuerzo": si S3 falla, se registra y se continúa — la
persistencia de evidencia no debe tumbar el flujo de participación.
"""
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings

log = logging.getLogger("validia.s3")


def _client():
    kwargs = {"region_name": settings.AWS_S3_REGION or settings.AWS_REGION}
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
    return boto3.client("s3", **kwargs)


def upload_bytes(key: str, content: bytes, content_type: str) -> str | None:
    """Sube bytes a S3 y devuelve la llave, o None si no hay bucket configurado
    o si falla (best-effort — no propaga la excepción)."""
    if not settings.AWS_S3_BUCKET or not content:
        return None
    try:
        _client().put_object(
            Bucket=settings.AWS_S3_BUCKET,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        return key
    except (BotoCoreError, ClientError) as exc:
        log.warning("No se pudo subir %s a S3: %s", key, exc)
        return None
