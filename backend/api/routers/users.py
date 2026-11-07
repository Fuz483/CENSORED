from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_admin, get_current_user
from core.uo_demo import is_demo_institution
from db.database import get_db
from db.models import User
from schemas.user import UserCreate, UserResponse

router = APIRouter(prefix="/api/v1/users", tags=["Пользователи"])


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация пользователя",
)
async def create_user(
    payload: UserCreate,
    _: Annotated[User, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Создание учетной записи пользователя с сохранением паспортных данных / УНП."""
    if is_demo_institution(payload.user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Идентификатор учреждения зарезервирован.")
    stmt = select(User).where(User.user_id == payload.user_id)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Пользователь с идентификатором user_id='{payload.user_id}' уже зарегистрирован.",
        )

    new_user = User(
        user_id=payload.user_id,
        name=payload.name,
        phone=payload.phone,
        passport_id=payload.passport_id,
        role=payload.role.value,
        rating=payload.rating,
    )
    db.add(new_user)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким идентификатором уже зарегистрирован.",
        ) from error
    await db.refresh(new_user)
    return new_user


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Получение профиля пользователя",
)
async def get_user_profile(
    user_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Извлечение учетных данных пользователя по внешнему идентификатору user_id."""
    if user_id == current_user.user_id:
        return current_user
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Нет доступа к профилю другого пользователя.")
    stmt = select(User).where(User.user_id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь с идентификатором user_id='{user_id}' не найден.",
        )
    return user
