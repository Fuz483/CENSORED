"""Provision the single hackathon account; password is never stored in source."""
import asyncio
import getpass

from sqlalchemy import select
from core.security import hash_password
from core.uo_demo import UO_DEMO_SCHOOL, UO_DEMO_USER_ID
from db.database import AsyncSessionLocal
from db.models import User


async def setup():
    password = getpass.getpass("Demo UO password (8+ characters): ")
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.user_id == UO_DEMO_USER_ID))).scalar_one_or_none()
        if user is None:
            user = User(user_id=UO_DEMO_USER_ID, name=UO_DEMO_SCHOOL, phone="", role="master", rating=5)
            db.add(user)
        user.password_hash = hash_password(password)
        await db.commit()
    print("Demo UO account ready.")


if __name__ == "__main__":
    asyncio.run(setup())
