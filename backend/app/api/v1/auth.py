from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    MessageResponse,
    MFASetupResponse,
    MFAVerifyRequest,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return auth_service.login(db, payload, ip_address, user_agent)


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> RefreshResponse:
    return auth_service.refresh_access_token(db, payload.refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)) -> MessageResponse:
    return MessageResponse(message="Sesión cerrada exitosamente")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_service.forgot_password(db, payload.email, background_tasks)
    return MessageResponse(message="Si el correo existe, recibirás instrucciones en los próximos minutos")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    auth_service.reset_password(db, payload.token, payload.new_password, payload.confirm_password)
    return MessageResponse(message="Contraseña actualizada exitosamente")


@router.get("/me", response_model=MeResponse)
def me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MeResponse:
    return auth_service.get_me(db, current_user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    auth_service.change_password(
        db, current_user, payload.current_password, payload.new_password, payload.confirm_password
    )
    return MessageResponse(message="Contraseña actualizada exitosamente")


@router.post("/mfa/setup", response_model=MFASetupResponse)
def mfa_setup(current_user: User = Depends(get_current_user)) -> MFASetupResponse:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="MFA no implementado aún")


@router.post("/mfa/verify", response_model=MessageResponse)
def mfa_verify(payload: MFAVerifyRequest) -> MessageResponse:
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="MFA no implementado aún")
