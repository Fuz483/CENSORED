from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
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
    db: AsyncSession = Depends(get_db),
) -> User:
    """Создание учетной записи пользователя с сохранением паспортных данных / УНП."""
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
    await db.commit()
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
    db: AsyncSession = Depends(get_db),
) -> User:
    """Извлечение учетных данных пользователя по внешнему идентификатору user_id."""
    stmt = select(User).where(User.user_id == user_id)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Пользователь с идентификатором user_id='{user_id}' не найден.",
        )
    return user