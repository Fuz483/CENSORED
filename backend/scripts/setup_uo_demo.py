"""Provision demo UO accounts for the catalog without storing a plaintext password."""
import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.security import hash_password, verify_password
from core.uo_demo import UO_DEMO_SCHOOL, demo_institution_id, is_demo_institution
from db.database import AsyncSessionLocal
from db.models import RoomListing, User


async def provision_demo_institutions(db: AsyncSession, password: str) -> int:
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")

    listings = (await db.scalars(select(RoomListing).order_by(RoomListing.id).with_for_update())).all()
    production_schools = {
        listing.school for listing in listings
        if listing.owner_id and not is_demo_institution(listing.owner_id)
    }
    schools = ({listing.school for listing in listings} | {UO_DEMO_SCHOOL}) - production_schools
    account_ids = {school: demo_institution_id(school) for school in schools}
    accounts = {account.user_id: account for account in (await db.scalars(
        select(User).where(User.user_id.in_(account_ids.values())).order_by(User.id).with_for_update()
    )).all()}

    for school, user_id in sorted(account_ids.items()):
        account = accounts.get(user_id)
        if account is None:
            account = User(user_id=user_id, name=school, phone="", role="master", rating=5)
            db.add(account)
        elif account.role != "master":
            raise ValueError(f"Reserved institution ID already exists: {user_id}")
        account.name = school
        if not account.password_hash or not verify_password(password, account.password_hash):
            account.password_hash = hash_password(password)

    await db.flush()
    for listing in listings:
        if listing.owner_id is None and listing.school in account_ids:
            listing.owner_id = account_ids[listing.school]
    return len(account_ids)


async def setup(password: str) -> None:
    if not settings.UO_DEMO_ENABLED:
        raise SystemExit("Set UO_DEMO_ENABLED=true in the demo environment before provisioning accounts.")
    async with AsyncSessionLocal() as db:
        count = await provision_demo_institutions(db, password)
        await db.commit()
    print(f"Demo UO accounts ready: {count}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--password-stdin", action="store_true", help="Read the password from standard input.")
    args = parser.parse_args()
    password = sys.stdin.readline().rstrip("\r\n") if args.password_stdin else getpass.getpass("Demo UO password (8+ characters): ")
    asyncio.run(setup(password))
