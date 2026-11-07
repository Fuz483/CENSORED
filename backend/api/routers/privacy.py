from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_current_tenant
from db.database import get_db
from db.models import Booking, User
from schemas.user import UserResponse

router = APIRouter(prefix="/api/v1/privacy", tags=["Персональные данные"])


@router.get("/export")
async def export_personal_data(
    response: Response,
    user: Annotated[User, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    orders = (await db.execute(select(
        Booking.id, Booking.school, Booking.room, Booking.date, Booking.start_time, Booking.end_time,
        Booking.price, Booking.state, Booking.series_label, Booking.series_ends_on, Booking.reservation_id,
        Booking.agreement_text, Booking.agreement_version, Booking.agreement_accepted_at,
        Booking.visitor_name, Booking.visitor_phone,
    ).where(or_(Booking.user_id == user.user_id, Booking.series_tenant_id == user.user_id))
        .order_by(Booking.date, Booking.start_time, Booking.id))).mappings().all()
    response.headers["Cache-Control"] = "no-store"
    return {
        "profile": UserResponse.model_validate(user).model_dump(mode="json"),
        "orders": [{**row, "price": str(row["price"])} for row in orders],
        "erasure_requested_at": user.erasure_requested_at,
    }


@router.post("/erasure-request")
async def request_erasure(
    response: Response,
    user: Annotated[User, Depends(get_current_tenant)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, datetime]:
    await db.execute(update(User).where(User.id == user.id, User.erasure_requested_at.is_(None))
                     .values(erasure_requested_at=datetime.now(UTC)))
    await db.commit()
    await db.refresh(user, attribute_names=["erasure_requested_at"])
    response.headers["Cache-Control"] = "no-store"
    return {"requested_at": user.erasure_requested_at}
