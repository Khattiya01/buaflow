from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE_NAME, encode_session, verify_password
from app.config import settings
from app.db import get_db
from app.log import log
from app.models import User
from app.schemas import LoginRequest, LoginResponse

router = APIRouter()


@router.post("/api/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    email = body.email.strip().lower()
    password = body.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        log.warn("auth.login.failed")
        raise HTTPException(status_code=401, detail="invalid email or password")

    log.info("auth.login.success", {"userId": user.id, "role": user.role})
    token = encode_session(user.id, user.role)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
        max_age=60 * 60 * 8,
    )
    return LoginResponse(id=user.id, email=user.email, name=user.name, role=user.role, token=token)  # type: ignore[arg-type]


@router.post("/api/auth/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"ok": True}
