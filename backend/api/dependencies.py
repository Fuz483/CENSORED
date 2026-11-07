from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.security import decode_access_token
from core.uo_demo import is_demo_institution
from db.database import get_db
from db.models import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user_id = decode_access_token(credentials.credentials) if credentials else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Войдите в аккаунт.")
    user = (await db.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия недействительна.")
    return user


async def get_current_tenant(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "tenant":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Эта операция доступна арендатору.")
    return user


async def get_current_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Эта операция доступна администратору.")
    return user


async def get_current_school(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "master" or (is_demo_institution(user.user_id) and not settings.UO_DEMO_ENABLED):
        raise HTTPException(status_code=403, detail="Нет доступа к кабинету УО.")
    return user
