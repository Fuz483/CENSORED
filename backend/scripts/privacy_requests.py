"""List outstanding demo erasure requests for the database administrator."""
import asyncio

from sqlalchemy import select

from db.database import AsyncSessionLocal
from db.models import User


async def main() -> None:
    async with AsyncSessionLocal() as db:
        requests = await db.execute(select(User.user_id, User.erasure_requested_at)
                                    .where(User.erasure_requested_at.is_not(None))
                                    .order_by(User.erasure_requested_at))
        for user_id, requested_at in requests:
            print(f"{requested_at.isoformat()}\t{user_id}")


if __name__ == "__main__":
    asyncio.run(main())
