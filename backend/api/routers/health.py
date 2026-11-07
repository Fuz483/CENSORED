import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import AuthRateLimit, Booking, CaptchaChallenge, RevokedSession, RoomListing, User

router = APIRouter(tags=["Системные проверки"])


@router.get("/ready", responses={503: {"description": "Database unavailable"}})
async def ready(db: Annotated[AsyncSession, Depends(get_db)]) -> JSONResponse:
    try:
        async with asyncio.timeout(2):
            await db.execute(select(
                select(RoomListing.photo_sanitized).limit(1).scalar_subquery(),
                select(Booking.visitor_name).limit(1).scalar_subquery(),
                select(User.erasure_requested_at).limit(1).scalar_subquery(),
                select(RevokedSession.token_id).limit(1).scalar_subquery(),
                select(CaptchaChallenge.challenge_id).limit(1).scalar_subquery(),
                select(AuthRateLimit.bucket).limit(1).scalar_subquery(),
            ))
    except (SQLAlchemyError, OSError, TimeoutError):
        return JSONResponse({"status": "unavailable"}, status_code=503, headers={"Cache-Control": "no-store"})
    return JSONResponse({"status": "ready"}, headers={"Cache-Control": "no-store"})
