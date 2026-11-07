import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from api.dependencies import get_current_tenant, get_current_user
from core.captcha import issue_challenge, verify_challenge
from core.phones import normalize_phone
from core.security import create_access_token, hash_password, verify_password
from db.database import get_db
from db.models import User
from schemas.auth import LoginRequest, ProfileUpdateRequest, RegisterRequest, TokenResponse, UoInstitution, UoLoginRequest
from core.config import settings
from core.uo_demo import UO_CATALOG_ID_PREFIX, UO_DEMO_USER_ID, is_demo_institution
from schemas.user import UserResponse

router = APIRouter(prefix="/api/v1/auth", tags=["Аутентификация"])


async def save_account(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Аккаунт с таким телефоном уже существует.") from error


def token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.user_id),
        user=UserResponse.model_validate(user).model_dump(mode="json"),
    )


def account_name(*parts: str | None, fallback: str = "") -> str:
    name = " ".join(part for part in parts if part) or fallback
    if len(name) > 255:
        raise HTTPException(status_code=422, detail="Полное имя не должно превышать 255 символов.")
    return name


@router.get("/captcha")
async def registration_captcha(response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    return issue_challenge()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    if not verify_challenge(payload.captcha_id, payload.captcha_answer):
        raise HTTPException(status_code=400, detail="Код с картинки неверен или истёк. Введите новый код.")
    phone = payload.phone
    existing = await db.scalar(select(User.id).where(User.phone == phone).limit(1))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Аккаунт с таким телефоном уже существует.")
    name = account_name(payload.first_name, payload.patronymic, payload.surname, fallback=payload.name)
    user = User(
        user_id=f"USR-{secrets.token_urlsafe(18)}",
        name=name,
        phone=phone,
        surname=payload.surname,
        first_name=payload.first_name,
        patronymic=payload.patronymic or None,
        email=payload.email,
        role="tenant",
        rating=5.0,
        password_hash=await run_in_threadpool(hash_password, payload.password),
    )
    db.add(user)
    await save_account(db)
    await db.refresh(user)
    return token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    candidates = (await db.scalars(select(User).where(
        User.phone == normalize_phone(payload.phone), User.role == "tenant", User.password_hash.is_not(None),
    ))).all()
    matches = [
        user for user in candidates
        if user.password_hash and await run_in_threadpool(verify_password, payload.password, user.password_hash)
    ]
    exact = [user for user in matches if user.legacy_phone == payload.phone]
    if len(matches) == 1:
        return token_response(matches[0])
    if len(exact) == 1:
        return token_response(exact[0])
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный телефон или пароль.")


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
) -> User:
    name = account_name(payload.first_name, payload.patronymic, payload.surname)
    phone = payload.phone
    if phone != user.phone:
        duplicate = await db.scalar(select(User.id).where(User.phone == phone, User.user_id != user.user_id).limit(1))
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Аккаунт с таким телефоном уже существует.")
        user.legacy_phone = None

    user.surname = payload.surname
    user.first_name = payload.first_name
    user.patronymic = payload.patronymic or None
    user.phone = phone
    user.email = payload.email
    user.name = name
    await save_account(db)
    await db.refresh(user)
    return user


@router.get("/uo/institutions")
async def uo_institutions(db: Annotated[AsyncSession, Depends(get_db)]) -> list[UoInstitution]:
    if not settings.UO_DEMO_ENABLED:
        return []
    rows = await db.execute(select(User.user_id, User.name).where(
        User.role == "master", User.password_hash.is_not(None),
        or_(User.user_id == UO_DEMO_USER_ID, User.user_id.startswith(UO_CATALOG_ID_PREFIX)),
    ).order_by(User.name, User.user_id))
    return [UoInstitution(id=user_id, name=name) for user_id, name in rows]


@router.post("/uo/login", response_model=TokenResponse)
async def uo_login(payload: UoLoginRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    if not settings.UO_DEMO_ENABLED:
        raise HTTPException(status_code=403, detail="Вход для УО отключён.")
    institution_id = payload.institution_id or UO_DEMO_USER_ID
    if not is_demo_institution(institution_id):
        raise HTTPException(status_code=401, detail="Неверный пароль УО.")
    user = await db.scalar(select(User).where(User.user_id == institution_id, User.role == "master"))
    if user is None or not user.password_hash or not await run_in_threadpool(verify_password, payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль УО.")
    return token_response(user)
