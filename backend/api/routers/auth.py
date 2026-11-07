import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_user
from core.captcha import issue_challenge, verify_challenge
from core.security import create_access_token, hash_password, verify_password
from db.database import get_db
from db.models import User
from schemas.auth import LoginRequest, ProfileUpdateRequest, RegisterRequest, TokenResponse, UoLoginRequest
from core.config import settings
from core.uo_demo import UO_DEMO_USER_ID
from schemas.user import UserResponse

router = APIRouter(prefix="/api/v1/auth", tags=["Аутентификация"])


def token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.user_id),
        user=UserResponse.model_validate(user).model_dump(mode="json"),
    )


@router.get("/captcha")
async def registration_captcha(response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    return issue_challenge()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not verify_challenge(payload.captcha_id, payload.captcha_answer):
        raise HTTPException(status_code=400, detail="Код с картинки неверен или истёк. Введите новый код.")
    phone = payload.phone.strip()
    existing = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Аккаунт с таким телефоном уже существует.")
    surname = payload.surname.strip() or None if payload.surname else None
    first_name = payload.first_name.strip() or None if payload.first_name else None
    patronymic = payload.patronymic.strip() or None if payload.patronymic else None
    name = " ".join(part for part in (first_name, patronymic, surname) if part) or payload.name.strip()
    user = User(
        user_id=f"USR-{secrets.token_urlsafe(18)}",
        name=name,
        phone=phone,
        surname=surname,
        first_name=first_name,
        patronymic=patronymic,
        email=payload.email,
        role="tenant",
        rating=5.0,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = (await db.execute(select(User).where(User.phone == payload.phone.strip()))).scalar_one_or_none()
    if user is None or user.password_hash is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный телефон или пароль.")
    return token_response(user)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    phone = payload.phone.strip()
    duplicate = (await db.execute(select(User).where(User.phone == phone, User.user_id != user.user_id))).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Аккаунт с таким телефоном уже существует.")

    user.surname = payload.surname.strip()
    user.first_name = payload.first_name.strip()
    user.patronymic = payload.patronymic.strip() if payload.patronymic and payload.patronymic.strip() else None
    user.phone = phone
    user.email = payload.email
    user.name = " ".join(part for part in (user.first_name, user.patronymic, user.surname) if part)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/uo/login", response_model=TokenResponse)
async def uo_login(payload: UoLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not settings.UO_DEMO_ENABLED:
        raise HTTPException(status_code=403, detail="Вход для УО отключён.")
    user = (await db.execute(select(User).where(User.user_id == UO_DEMO_USER_ID))).scalar_one_or_none()
    if user is None or user.role != "master" or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль УО.")
    return token_response(user)
