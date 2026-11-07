import hmac
from time import time

from fastapi import HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.security import AccessSession
from db.models import AuthRateLimit, RevokedSession


async def enforce_auth_limit(
    db: AsyncSession, request: Request, action: str, limit: int,
) -> None:
    now = int(time())
    expires_at = (now // 60 + 1) * 60
    client = request.client.host if request.client else "unknown"
    bucket = hmac.digest(settings.JWT_SECRET_KEY.encode(), f"limit:{action}:{client}:{expires_at}".encode(), "sha256").hex()
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else postgres_insert
    await db.execute(delete(AuthRateLimit).where(AuthRateLimit.expires_at <= now))
    count = await db.scalar(insert(AuthRateLimit).values(bucket=bucket, attempts=1, expires_at=expires_at)
        .on_conflict_do_update(
            index_elements=[AuthRateLimit.bucket],
            set_={"attempts": AuthRateLimit.attempts + 1},
            where=AuthRateLimit.attempts < limit,
        ).returning(AuthRateLimit.attempts))
    await db.commit()
    if count is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много попыток. Повторите чуть позже.",
            headers={"Retry-After": str(expires_at - now), "Cache-Control": "no-store"},
        )


async def revoke_session(db: AsyncSession, session: AccessSession) -> None:
    await db.execute(delete(RevokedSession).where(RevokedSession.expires_at <= int(time())))
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else postgres_insert
    await db.execute(insert(RevokedSession).values(token_id=session.token_id, expires_at=session.expires_at)
        .on_conflict_do_nothing(index_elements=[RevokedSession.token_id]))
    await db.commit()
