import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(*, to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM
    message["To"] = to_email
    message.set_content(body)

    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.info("SMTP no configurado; email omitido para %s: %s", to_email, subject)
        return

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
    except Exception:
        logger.exception("Error enviando email a %s", to_email)


def send_temp_password_email(*, to_email: str, full_name: str, temp_password: str) -> None:
    login_link = f"{settings.FRONTEND_URL}/login"
    body = (
        f"Hola {full_name},\n\n"
        f"Tu cuenta en {settings.APP_NAME} ha sido creada.\n\n"
        f"Tu contraseña temporal es: {temp_password}\n\n"
        f"Ingresa al portal en: {login_link}\n\n"
        "Deberás cambiar tu contraseña en tu primer inicio de sesión.\n\n"
        "Si tienes alguna pregunta, contacta a tu administrador."
    )
    send_email(
        to_email=to_email,
        subject=f"Bienvenido a {settings.APP_NAME} — Credenciales de acceso",
        body=body,
    )


def send_password_reset_email(*, to_email: str, reset_token: str) -> None:
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    body = (
        f"Recibimos una solicitud para restablecer tu contraseña en {settings.APP_NAME}.\n\n"
        f"Ingresa al siguiente enlace para continuar (válido por 24 horas):\n{reset_link}\n\n"
        "Si no solicitaste este cambio, ignora este correo."
    )
    send_email(to_email=to_email, subject=f"Recuperación de contraseña - {settings.APP_NAME}", body=body)
