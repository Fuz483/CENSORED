"""Contract integration tests with an isolated in-memory DB (no live data)."""
import datetime
import unittest
from io import BytesIO
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db.database import Base, get_db
from main import app
from core.config import settings
from core.security import create_access_token, hash_password
from core.uo_demo import UO_DEMO_SCHOOL, UO_DEMO_USER_ID, demo_institution_id
from db.models import Booking, RoomListing, User
from api.routers import room_photos
from api.routers.bookings import minsk_now
from scripts.setup_uo_demo import provision_demo_institutions


def photo_bytes(format_name: str = "JPEG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buffer, format=format_name)
    return buffer.getvalue()


class ApiContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

        async def database():
            async with self.sessions() as session:
                yield session

        async with self.sessions() as session:
            session.add_all([
                RoomListing(
                    school=school, type_room="sport_hall", room=room, price=45,
                    city="Минск", city_district="Ленинский" if school == UO_DEMO_SCHOOL else "Октябрьский",
                    available_from=datetime.time(14), available_to=datetime.time(21),
                )
                for school, room in (
                    ("ГУО «Средняя школа № 1 г. Минска»", "Спортзал № 1"),
                    (UO_DEMO_SCHOOL, "Спортивный зал"),
                )
            ])
            await session.commit()
        app.dependency_overrides[get_db] = database
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        app.dependency_overrides.clear()
        await self.engine.dispose()

    async def captcha_payload(self):
        with patch("core.captcha.secrets.choice", return_value="4"):
            challenge = await self.client.get("/api/v1/auth/captcha")
        self.assertEqual(challenge.status_code, 200)
        self.assertEqual(challenge.headers["cache-control"], "no-store")
        self.assertTrue(challenge.json()["image"].startswith("data:image/png;base64,"))
        return {"captcha_id": challenge.json()["id"], "captcha_answer": "44444"}

    async def submit_booking(self, payload, headers):
        preview = await self.client.post("/api/v1/bookings/agreement", headers=headers, json=payload)
        if preview.status_code != 200:
            return preview
        return await self.client.post("/api/v1/bookings", headers=headers, json={
            **payload, "agreement_accepted": True, "agreement_token": preview.json()["token"],
        })

    async def register(self, phone="+375291234567"):
        response = await self.client.post("/api/v1/auth/register", json={
            **await self.captcha_payload(),
            "name": "Тестовый арендатор", "phone": phone, "password": "TestPassword123",
        })
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        return data["user"], {"Authorization": f"Bearer {data['access_token']}"}

    async def test_auth_and_validation(self):
        user, headers = await self.register()
        self.assertIsNone(user["surname"])
        self.assertIsNone(user["email"])
        self.assertEqual((await self.client.get("/api/v1/auth/me", headers=headers)).json()["id"], user["id"])
        bad_login = await self.client.post("/api/v1/auth/login", json={"phone": user["phone"], "password": "wrong"})
        self.assertEqual(bad_login.status_code, 401)
        login = await self.client.post("/api/v1/auth/login", json={"phone": user["phone"], "password": "TestPassword123"})
        self.assertEqual(login.status_code, 200)
        self.assertNotIn("password_hash", login.json()["user"])
        self.assertEqual((await self.client.get("/api/v1/rooms/available")).status_code, 422)
        for room_type in ("sport_hall", "assembly_hall", "it_lab", "workshop", "pool"):
            available = await self.client.get("/api/v1/rooms/available", params={
                "date": minsk_now().date().isoformat(), "type_room": room_type,
            })
            self.assertEqual(available.status_code, 200, available.text)
        self.assertEqual((await self.client.post("/api/v1/bookings", json={})).status_code, 401)

    async def test_legacy_user_creation_and_profiles_require_authorization(self):
        payload = {
            "user_id": "legacy-record", "name": "Тестовый профиль",
            "phone": "+375291234560", "passport_id": "TEST-ONLY", "role": "tenant",
        }
        url = "/api/v1/users"
        self.assertEqual((await self.client.post(url, json=payload)).status_code, 401)
        tenant, tenant_headers = await self.register(payload["phone"])
        self.assertEqual((await self.client.post(url, json=payload, headers=tenant_headers)).status_code, 403)
        own_url = f"{url}/{tenant['user_id']}"
        self.assertEqual((await self.client.get(own_url)).status_code, 401)
        self.assertEqual((await self.client.get(own_url, headers=tenant_headers)).json()["id"], tenant["id"])

        async with self.sessions() as db:
            db.add(User(user_id="audit-admin", name="Тестовый администратор", phone="", role="admin"))
            await db.commit()
        admin_headers = {"Authorization": f"Bearer {create_access_token('audit-admin')}"}
        payload["phone"] = "+375291234561"
        created = await self.client.post(url, json=payload, headers=admin_headers)
        self.assertEqual(created.status_code, 201, created.text)
        target = f"{url}/{payload['user_id']}"
        self.assertEqual((await self.client.get(target, headers=tenant_headers)).status_code, 403)
        self.assertEqual((await self.client.get(target, headers=admin_headers)).json()["passport_id"], payload["passport_id"])
        reserved = await self.client.post(url, headers=admin_headers, json={**payload, "user_id": UO_DEMO_USER_ID})
        self.assertEqual(reserved.status_code, 403)

    async def test_registration_and_profile_update(self):
        response = await self.client.post("/api/v1/auth/register", json={
            **await self.captcha_payload(),
            "name": "Анна Ковалёва", "surname": "Ковалёва", "first_name": "Анна",
            "patronymic": "", "email": "  ANNA@example.com ",
            "phone": "+375291234567", "password": "TestPassword123",
        })
        self.assertEqual(response.status_code, 201, response.text)
        registered = response.json()["user"]
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        self.assertEqual(registered["surname"], "Ковалёва")
        self.assertEqual(registered["first_name"], "Анна")
        self.assertIsNone(registered["patronymic"])
        self.assertEqual(registered["email"], "anna@example.com")

        update = await self.client.patch("/api/v1/auth/me", headers=headers, json={
            "surname": "Смирнова", "first_name": "Анна", "patronymic": "Игоревна",
            "email": "anna.new@example.com", "phone": "+375291234567",
        })
        self.assertEqual(update.status_code, 200, update.text)
        self.assertEqual(update.json()["name"], "Анна Игоревна Смирнова")
        self.assertEqual(update.json()["email"], "anna.new@example.com")
        self.assertEqual(update.json()["phone"], "+375291234567")
        persisted = await self.client.get("/api/v1/auth/me", headers=headers)
        self.assertEqual(persisted.status_code, 200)
        self.assertEqual(persisted.json()["surname"], "Смирнова")
        self.assertEqual(persisted.json()["email"], "anna.new@example.com")
        for invalid_name in (
            {"surname": " ", "first_name": " "},
            {"surname": "Ф" * 100, "first_name": "И" * 100, "patronymic": "О" * 100},
        ):
            rejected = await self.client.patch("/api/v1/auth/me", headers=headers, json={
                **invalid_name, "phone": "+375291234567",
            })
            self.assertEqual(rejected.status_code, 422, rejected.text)
        unchanged = await self.client.get("/api/v1/auth/me", headers=headers)
        self.assertEqual(unchanged.json()["name"], update.json()["name"])

        other, _ = await self.register("+375291234568")
        conflict = await self.client.patch("/api/v1/auth/me", headers=headers, json={
            "surname": "Смирнова", "first_name": "Анна", "phone": other["phone"],
        })
        self.assertEqual(conflict.status_code, 409)
        unauthorized = await self.client.patch("/api/v1/auth/me", json={
            "surname": "Смирнова", "first_name": "Анна", "phone": "+375291234567",
        })
        self.assertEqual(unauthorized.status_code, 401)

        invalid_email = await self.client.post("/api/v1/auth/register", json={
            **await self.captcha_payload(),
            "name": "Пользователь", "phone": "+375291234569",
            "password": "TestPassword123", "email": "not-an-email",
        })
        self.assertEqual(invalid_email.status_code, 422)

    async def test_captcha_is_required_one_use_and_expires(self):
        url = "/api/v1/auth/register"
        account = {"name": "Тест", "phone": "+375291234567", "password": "TestPassword123"}
        self.assertEqual((await self.client.post(url, json=account)).status_code, 422)
        captcha = await self.captcha_payload()
        for answer in ("12345", "44444"):
            result = await self.client.post(url, json={**account, **captcha, "captcha_answer": answer})
            self.assertEqual(result.status_code, 400)
        with patch("core.captcha.monotonic", return_value=10):
            captcha = await self.captcha_payload()
        with patch("core.captcha.monotonic", return_value=191):
            self.assertEqual((await self.client.post(url, json={**account, **captcha})).status_code, 400)
        captcha = await self.captcha_payload()
        self.assertEqual((await self.client.post(url, json={**account, **captcha})).status_code, 201)
        self.assertEqual((await self.client.post(url, json={
            **account, **captcha, "phone": "+375291234568",
        })).status_code, 400)

    async def test_catalog_matches_daily_availability_and_validates_range(self):
        today = minsk_now().date()
        url = "/api/v1/rooms/catalog"
        for params in (
            {"start": "invalid"}, {"start": today, "days": 0}, {"start": today, "days": 8},
            {"start": datetime.date.max, "days": 2},
        ):
            self.assertEqual((await self.client.get(url, params=params)).status_code, 422)
        response = await self.client.get(url, params={"start": today, "days": 7})
        self.assertEqual(response.status_code, 200, response.text)
        catalog = response.json()
        for offset in range(7):
            day = (today + datetime.timedelta(days=offset)).isoformat()
            daily = await self.client.get("/api/v1/rooms/available", params={"date": day, "type_room": "sport_hall"})
            self.assertEqual([room for room in catalog if room["date"] == day], daily.json())
        self.assertTrue(all(room["city"] == "Минск" and room["city_district"] for room in catalog))

    async def test_catalog_does_not_offer_elapsed_or_partial_slots(self):
        now = datetime.datetime(2026, 11, 7, 16)
        async with self.sessions() as db:
            await db.execute(update(RoomListing).values(
                available_from=datetime.time(14, 5), available_to=datetime.time(16, 41),
            ))
            await db.commit()
        with patch("api.routers.bookings.minsk_now", return_value=now):
            response = await self.client.get("/api/v1/rooms/catalog", params={"start": "2026-11-06", "days": 3})
        self.assertEqual(response.status_code, 200, response.text)
        for date, starts in (("2026-11-06", []), ("2026-11-07", ["16:15:00"])):
            for room in (item for item in response.json() if item["date"] == date):
                self.assertEqual([slot["start_time"] for slot in room["available_slots"]], starts)
        tomorrow = next(item for item in response.json() if item["date"] == "2026-11-08")
        self.assertEqual(tomorrow["available_slots"][0]["start_time"], "14:15:00")
        self.assertEqual(tomorrow["available_slots"][-1]["end_time"], "16:30:00")

    async def test_booking_availability_cancel_and_rebook(self):
        user, headers = await self.register()
        date = (minsk_now().date() + datetime.timedelta(days=2)).isoformat()
        query = {"date": date, "type_room": "sport_hall"}
        available = await self.client.get("/api/v1/rooms/available", params=query)
        self.assertEqual(available.status_code, 200, available.text)
        room = available.json()[0]
        self.assertEqual(len(room["available_slots"]), 28)
        payload = {"school": room["school"], "room": room["room"], "type_room": room["type_room"],
                   "date": date, "start_time": "14:15", "hours": 1.25, "user_id": user["user_id"]}
        unknown = await self.client.post("/api/v1/bookings", headers=headers, json={**payload, "room": "Неизвестное помещение"})
        self.assertEqual(unknown.status_code, 404)
        past = await self.client.post("/api/v1/bookings", headers=headers, json={
            **payload, "date": (minsk_now().date() - datetime.timedelta(days=1)).isoformat(),
        })
        self.assertEqual(past.status_code, 400)
        for invalid in (0.75, 1.1):
            response = await self.client.post("/api/v1/bookings", headers=headers, json={**payload, "hours": invalid})
            self.assertEqual(response.status_code, 422, response.text)
        created = await self.submit_booking(payload, headers)
        self.assertEqual(created.status_code, 201, created.text)
        booking = created.json()[0]
        self.assertEqual(booking["state"], "confirmed")
        self.assertTrue(booking["code"])
        self.assertEqual(float(booking["price"]), 56.25)
        self.assertEqual(booking["end_time"], "15:30:00")
        collision = await self.submit_booking(payload, headers)
        self.assertEqual(collision.status_code, 409)
        after = (await self.client.get("/api/v1/rooms/available", params=query)).json()[0]
        self.assertEqual(len(after["available_slots"]), 23)
        history_url = f"/api/v1/bookings/user/{user['user_id']}"
        self.assertEqual(len((await self.client.get(history_url, headers=headers)).json()), 1)
        _, other_headers = await self.register("+375291234568")
        self.assertEqual((await self.client.get(history_url, headers=other_headers)).status_code, 403)
        state_url = f"/api/v1/bookings/{booking['id']}/state"
        self.assertEqual((await self.client.patch(state_url, headers=other_headers, json={"state": "cancelled"})).status_code, 403)
        self.assertEqual((await self.client.patch(state_url, headers=headers, json={"state": "paid"})).status_code, 400)
        cancelled = await self.client.patch(state_url, headers=headers, json={"state": "cancelled"})
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        rebooked = await self.submit_booking(payload, headers)
        self.assertEqual(rebooked.status_code, 201, rebooked.text)

    async def test_booking_creation_issues_qr_and_guard_checks_booking_date(self):
        user, headers = await self.register()
        other_user, other_headers = await self.register("+375291234569")
        today = minsk_now().date()
        booking_day = today + datetime.timedelta(days=1)
        room = (await self.client.get("/api/v1/rooms/available", params={
            "date": booking_day.isoformat(), "type_room": "sport_hall",
        })).json()[0]
        payload = {
            "school": room["school"], "room": room["room"], "type_room": room["type_room"],
            "date": booking_day.isoformat(), "start_time": "14:00", "hours": 1,
            "user_id": user["user_id"],
        }
        wrong_owner = await self.client.post("/api/v1/bookings", headers=headers, json={
            **payload, "user_id": other_user["user_id"],
        })
        self.assertEqual(wrong_owner.status_code, 403)

        created = await self.submit_booking(payload, headers)
        self.assertEqual(created.status_code, 201, created.text)
        booking = created.json()[0]
        self.assertEqual(booking["state"], "confirmed")
        self.assertTrue(booking["code"], "Booking creation must issue a pass QR code immediately.")
        self.assertNotEqual(booking["code"], str(booking["id"]))
        self.assertEqual((await self.client.post("/api/v1/bookings/999/free-confirm", headers=headers)).status_code, 404)
        self.assertEqual(
            (await self.client.get(f"/api/v1/bookings/user/{user['user_id']}", headers=other_headers)).status_code,
            403,
        )

        scan_url = "/api/v1/guard/scan-qr"
        upcoming = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(upcoming.status_code, 200, upcoming.text)
        self.assertFalse(upcoming.json()["access_granted"])
        self.assertIn(booking_day.isoformat(), upcoming.json()["reason"])
        self.assertEqual(upcoming.json()["user"], {"name": "", "phone": ""})
        self.assertEqual(upcoming.json()["slots"], [])
        self.assertEqual(upcoming.headers["cache-control"], "no-store")

        async with self.sessions() as db:
            row = await db.get(Booking, booking["id"])
            row.date = today
            await db.commit()
        valid_today = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(valid_today.status_code, 200, valid_today.text)
        self.assertTrue(valid_today.json()["access_granted"])
        self.assertEqual(valid_today.json()["user"], {"name": user["name"], "phone": user["phone"]})
        self.assertNotIn("user_id", valid_today.json()["slots"][0])

        async with self.sessions() as db:
            row = await db.get(Booking, booking["id"])
            row.state = "pending"
            await db.commit()
        unconfirmed = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(unconfirmed.status_code, 200, unconfirmed.text)
        self.assertFalse(unconfirmed.json()["access_granted"])
        self.assertIn("не подтверждена", unconfirmed.json()["reason"])
        self.assertEqual(unconfirmed.json()["user"], {"name": "", "phone": ""})

        async with self.sessions() as db:
            row = await db.get(Booking, booking["id"])
            row.state = "confirmed"
            db.add(Booking(
                listing_id=row.listing_id, school=row.school, type_room=row.type_room, room=row.room,
                date=today, start_time=datetime.time(15), end_time=datetime.time(16), price=45,
                state="confirmed", code=row.code, user_id=other_user["user_id"],
            ))
            await db.commit()
        ambiguous = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(ambiguous.status_code, 200, ambiguous.text)
        self.assertFalse(ambiguous.json()["access_granted"])
        self.assertEqual(ambiguous.json()["user"], {"name": "", "phone": ""})

    async def test_checkout_requires_the_matching_accepted_agreement(self):
        user, headers = await self.register()
        date = minsk_now().date() + datetime.timedelta(days=2)
        payload = {
            "school": "ГУО «Средняя школа № 1 г. Минска»", "type_room": "sport_hall", "room": "Спортзал № 1",
            "date": date.isoformat(), "start_time": "16:00", "user_id": user["user_id"],
        }
        preview = await self.client.post("/api/v1/bookings/agreement", headers=headers, json=payload)
        self.assertEqual(preview.status_code, 200, preview.text)
        agreement = preview.json()
        self.assertIn("0 BYN", agreement["text"])
        self.assertEqual((await self.client.post("/api/v1/bookings", headers=headers, json={
            **payload, "agreement_token": agreement["token"],
        })).status_code, 400)
        self.assertEqual((await self.client.post("/api/v1/bookings", headers=headers, json={
            **payload, "start_time": "16:15", "agreement_token": agreement["token"], "agreement_accepted": True,
        })).status_code, 409)
        history = f"/api/v1/bookings/user/{user['user_id']}"
        self.assertEqual((await self.client.get(history, headers=headers)).json(), [])
        created = await self.submit_booking(payload, headers)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertTrue(created.json()[0]["code"])
        saved = (await self.client.get(history, headers=headers)).json()[0]
        self.assertEqual(saved["agreement_text"], agreement["text"])
        self.assertEqual(saved["agreement_version"], agreement["version"])
        self.assertTrue(saved["agreement_accepted_at"])
        async with self.sessions() as db:
            listing = await db.get(RoomListing, saved["listing_id"])
            listing.price = 99999999.99
            await db.commit()
        overflow = await self.submit_booking({**payload, "start_time": "17:00", "hours": 2}, headers)
        self.assertEqual(overflow.status_code, 422, overflow.text)

    async def test_weekly_reservation_blocks_only_its_room_and_weekday_until_cancelled(self):
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            db.add_all([
                User(user_id="school", name=school, phone="", role="master"),
                User(user_id="other-school", name="Другая школа", phone="", role="master"),
            ])
            await db.flush()
            await db.execute(update(RoomListing).where(RoomListing.school == school).values(owner_id="school"))
            await db.commit()
        headers = {"Authorization": f"Bearer {create_access_token('school')}"}
        other_headers = {"Authorization": f"Bearer {create_access_token('other-school')}"}
        tenant, tenant_headers = await self.register()
        date = minsk_now().date() + datetime.timedelta(days=2)
        next_week = date + datetime.timedelta(days=7)
        url = "/api/v1/uo/weekly-reservations"

        async def catalog(day):
            response = await self.client.get("/api/v1/rooms/available", params={
                "date": day.isoformat(), "type_room": "sport_hall",
            })
            return next(room for room in response.json() if room["school"] == school)

        listing = await catalog(date)
        reservation = {"listing_id": listing["id"], "date": date.isoformat(), "start_time": "16:00", "label": "Волейбол"}
        order = {
            "school": school, "type_room": "sport_hall", "room": listing["room"],
            "date": next_week.isoformat(), "start_time": "16:15", "user_id": tenant["user_id"],
        }
        self.assertEqual((await self.client.post(url, headers=tenant_headers, json=reservation)).status_code, 403)
        self.assertEqual((await self.client.post(url, headers=other_headers, json=reservation)).status_code, 404)
        existing = await self.submit_booking(order, tenant_headers)
        self.assertEqual(existing.status_code, 201, existing.text)
        self.assertEqual((await self.client.post(url, headers=headers, json=reservation)).status_code, 409)
        cancelled = await self.client.patch(
            f"/api/v1/bookings/{existing.json()[0]['id']}/state", headers=tenant_headers, json={"state": "cancelled"},
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        created = await self.client.post(url, headers=headers, json=reservation)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertIsNone(created.json()["code"])
        self.assertEqual((await self.client.post(url, headers=headers, json=reservation)).status_code, 409)
        self.assertEqual(len((await catalog(next_week))["available_slots"]), 24)
        self.assertEqual(len((await catalog(next_week + datetime.timedelta(days=1)))["available_slots"]), 28)
        week = await self.client.get("/api/v1/rooms/catalog", params={"start": next_week, "days": 2})
        self.assertEqual(week.status_code, 200, week.text)
        self.assertEqual([len(room["available_slots"]) for room in week.json() if room["id"] == listing["id"]], [24, 28])
        self.assertEqual((await self.submit_booking(order, tenant_headers)).status_code, 409)
        cancel_url = f"{url}/{created.json()['id']}/cancel"
        self.assertEqual((await self.client.patch(cancel_url, headers=other_headers)).status_code, 404)
        self.assertEqual((await self.client.patch(cancel_url, headers=headers)).status_code, 200)
        self.assertEqual((await self.submit_booking(order, tenant_headers)).status_code, 201)

    async def test_multi_day_series_issues_a_pass_only_to_the_linked_tenant(self):
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            db.add(User(user_id="school", name=school, phone="", role="master"))
            await db.flush()
            await db.execute(update(RoomListing).where(RoomListing.school == school).values(owner_id="school"))
            await db.commit()
        school_headers = {"Authorization": f"Bearer {create_access_token('school')}"}
        tenant, tenant_headers = await self.register()
        outsider, outsider_headers = await self.register("+375291234568")
        date = minsk_now().date() + datetime.timedelta(days=1)
        next_day = date + datetime.timedelta(days=1)
        catalog = (await self.client.get("/api/v1/rooms/available", params={"date": date, "type_room": "sport_hall"})).json()
        listing = next(item for item in catalog if item["school"] == school)
        series_url = "/api/v1/uo/weekly-reservations"
        payload = {
            "listing_id": listing["id"], "date": date.isoformat(), "start_time": "16:00",
            "label": "Волейбол", "weekdays": [date.weekday(), next_day.weekday()],
        }
        created = await self.client.post(series_url, headers=school_headers, json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        series = created.json()
        self.assertEqual(set(series["weekdays"]), set(payload["weekdays"]))
        self.assertEqual(len((await self.client.get(series_url, headers=school_headers)).json()), 1)

        visits_url = "/api/v1/bookings/reserved-visits"
        self.assertEqual((await self.client.get(visits_url, headers=tenant_headers)).json(), [])
        linked = await self.client.patch(
            f"{series_url}/{series['id']}/customer", headers=school_headers, json={"customer_phone": tenant["phone"]},
        )
        self.assertEqual(linked.status_code, 200, linked.text)
        self.assertEqual(linked.json()["customer_name"], tenant["name"])
        visits = (await self.client.get(visits_url, headers=tenant_headers)).json()
        self.assertEqual(len(visits), 4)
        self.assertEqual([visit["date"] for visit in visits[:2]], [date.isoformat(), next_day.isoformat()])
        self.assertEqual((await self.client.get(visits_url, headers=outsider_headers)).json(), [])
        visit = visits[0]
        order = {
            "school": school, "type_room": "sport_hall", "room": listing["room"], "date": visit["date"],
            "start_time": "16:00", "reservation_id": visit["reservation_id"], "user_id": tenant["user_id"],
        }
        self.assertEqual((await self.submit_booking({**order, "user_id": outsider["user_id"]}, outsider_headers)).status_code, 403)
        self.assertEqual((await self.submit_booking({**order, "start_time": "16:15"}, tenant_headers)).status_code, 403)
        self.assertEqual((await self.client.post("/api/v1/bookings", headers=tenant_headers, json=order)).status_code, 400)
        claim = await self.submit_booking(order, tenant_headers)
        self.assertEqual(claim.status_code, 201, claim.text)
        self.assertTrue(claim.json()[0]["code"])
        self.assertEqual((await self.submit_booking(order, tenant_headers)).status_code, 409)
        self.assertEqual(len((await self.client.get(visits_url, headers=tenant_headers)).json()), 3)
        self.assertEqual((await self.client.patch(f"{series_url}/{series['id']}/cancel", headers=school_headers)).status_code, 200)
        self.assertEqual((await self.client.get(visits_url, headers=tenant_headers)).json(), [])
        history = (await self.client.get(f"/api/v1/bookings/user/{tenant['user_id']}", headers=tenant_headers)).json()
        self.assertEqual(history[0]["code"], claim.json()[0]["code"])

    async def test_canonical_phone_login_and_scoped_customer_suggestions(self):
        tenant, headers = await self.register()
        phone = tenant["phone"]
        alternate = "8 (029) 123-45-67"
        login = await self.client.post("/api/v1/auth/login", json={"phone": alternate, "password": "TestPassword123"})
        self.assertEqual(login.status_code, 200, login.text)
        duplicate = await self.client.post("/api/v1/auth/register", json={
            **await self.captcha_payload(), "name": "Дубликат", "phone": alternate, "password": "TestPassword123",
        })
        self.assertEqual(duplicate.status_code, 409)
        async with self.sessions() as db:
            original = await db.scalar(select(User).where(User.user_id == tenant["user_id"]))
            original.legacy_phone = phone
            db.add_all([
                User(user_id="school", name="ГУО «Средняя школа № 1 г. Минска»", phone="", role="master"),
                User(user_id="legacy", name="Другой арендатор", phone=phone, legacy_phone=alternate,
                     role="tenant", password_hash=hash_password("TestPassword123")),
            ])
            await db.commit()
        url = "/api/v1/uo/customers/search"
        school_headers = {"Authorization": f"Bearer {create_access_token('school')}"}
        self.assertEqual((await self.client.post(url, headers=headers, json={"phone": alternate})).status_code, 403)
        self.assertEqual((await self.client.post(url, headers=school_headers, json={"phone": "8 (029)"})).json(), [])
        suggestions = (await self.client.post(url, headers=school_headers, json={"phone": "8 (029) 123-4"})).json()
        self.assertEqual({item["user_id"] for item in suggestions}, {tenant["user_id"], "legacy"})
        self.assertTrue(all(set(item) == {"phone", "name", "user_id"} and item["phone"] == phone for item in suggestions))
        for raw, expected in ((phone, tenant["user_id"]), (alternate, "legacy")):
            result = await self.client.post("/api/v1/auth/login", json={"phone": raw, "password": "TestPassword123"})
            self.assertEqual(result.json()["user"]["user_id"], expected)

    async def test_series_end_date_and_school_booking_cancellation(self):
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            db.add_all([User(user_id="school", name=school, phone="", role="master"),
                        User(user_id="other", name="Другая школа", phone="", role="master")])
            await db.flush()
            await db.execute(update(RoomListing).where(RoomListing.school == school).values(owner_id="school"))
            await db.commit()
        school_headers = {"Authorization": f"Bearer {create_access_token('school')}"}
        other_headers = {"Authorization": f"Bearer {create_access_token('other')}"}
        tenant, tenant_headers = await self.register()
        date = minsk_now().date() + datetime.timedelta(days=1)
        next_week = date + datetime.timedelta(days=7)
        catalog = (await self.client.get("/api/v1/rooms/available", params={"date": date, "type_room": "sport_hall"})).json()
        listing = next(item for item in catalog if item["school"] == school)
        series_url = "/api/v1/uo/weekly-reservations"
        series = await self.client.post(series_url, headers=school_headers, json={
            "listing_id": listing["id"], "date": date.isoformat(), "start_time": "16:00",
            "label": "Волейбол", "customer_phone": tenant["phone"], "ends_on": date.isoformat(),
        })
        self.assertEqual(series.status_code, 201, series.text)
        self.assertEqual(series.json()["ends_on"], date.isoformat())
        visits_url = "/api/v1/bookings/reserved-visits"
        visits = (await self.client.get(visits_url, headers=tenant_headers)).json()
        self.assertEqual([visit["date"] for visit in visits], [date.isoformat()])
        order = {
            "school": school, "room": listing["room"], "type_room": "sport_hall",
            "date": next_week.isoformat(), "start_time": "16:00", "user_id": tenant["user_id"],
        }
        later = await self.submit_booking(order, tenant_headers)
        self.assertEqual(later.status_code, 201, later.text)
        extend_url = f"{series_url}/{series.json()['id']}/end-date"
        extend = await self.client.patch(extend_url, headers=school_headers, json={"ends_on": next_week.isoformat()})
        self.assertEqual(extend.status_code, 409)
        cancel_url = f"/api/v1/uo/bookings/{later.json()[0]['id']}/cancel"
        self.assertEqual((await self.client.patch(cancel_url, headers=other_headers)).status_code, 404)
        self.assertEqual((await self.client.patch(cancel_url, headers=tenant_headers)).status_code, 403)
        cancelled = await self.client.patch(cancel_url, headers=school_headers)
        self.assertEqual(cancelled.json()["state"], "cancelled")
        extend = await self.client.patch(extend_url, headers=school_headers, json={"ends_on": next_week.isoformat()})
        self.assertEqual(extend.status_code, 200, extend.text)
        visit = {**order, "date": date.isoformat(), "reservation_id": visits[0]["reservation_id"]}
        booking = await self.submit_booking(visit, tenant_headers)
        self.assertEqual(booking.status_code, 201, booking.text)
        self.assertEqual((await self.client.patch(
            f"/api/v1/uo/bookings/{booking.json()[0]['id']}/cancel", headers=school_headers,
        )).status_code, 200)
        self.assertEqual((await self.submit_booking(visit, tenant_headers)).status_code, 409)
        self.assertEqual([item["date"] for item in (await self.client.get(visits_url, headers=tenant_headers)).json()],
                         [next_week.isoformat()])

    async def test_uo_demo_login_and_school_scope(self):
        old_enabled = settings.UO_DEMO_ENABLED
        settings.UO_DEMO_ENABLED = True
        try:
            async with self.sessions() as db:
                db.add(User(user_id=UO_DEMO_USER_ID, name=UO_DEMO_SCHOOL, phone="", role="master", rating=5,
                            password_hash=hash_password("LyceumDemo2026")))
                await db.commit()
            bad = await self.client.post("/api/v1/auth/uo/login", json={"password": "wrong"})
            self.assertEqual(bad.status_code, 401)
            login = await self.client.post("/api/v1/auth/uo/login", json={"password": "LyceumDemo2026"})
            self.assertEqual(login.status_code, 200, login.text)
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            self.assertEqual(login.json()["user"]["role"], "master")
            self.assertEqual((await self.client.get("/api/v1/auth/me", headers=headers)).json()["name"], UO_DEMO_SCHOOL)
            tenant, tenant_headers = await self.register()
            self.assertEqual((await self.client.get("/api/v1/uo/bookings", headers=tenant_headers)).status_code, 403)
            self.assertEqual((await self.client.get("/api/v1/uo/bookings")).status_code, 401)
            date = (minsk_now().date() + datetime.timedelta(days=2)).isoformat()
            for school, room in [(UO_DEMO_SCHOOL, "Спортивный зал"), ("ГУО «Средняя школа № 1 г. Минска»", "Спортзал № 1")]:
                response = await self.submit_booking({
                    "school": school, "room": room, "type_room": "sport_hall", "date": date,
                    "start_time": "14:15", "hours": 1.25, "user_id": tenant["user_id"],
                }, tenant_headers)
                self.assertEqual(response.status_code, 201, response.text)
            bookings = await self.client.get("/api/v1/uo/bookings", headers=headers)
            self.assertEqual(bookings.status_code, 200, bookings.text)
            self.assertEqual(len(bookings.json()), 1)
            self.assertEqual(bookings.json()[0]["school"], UO_DEMO_SCHOOL)
            self.assertEqual(bookings.json()[0]["customer_name"], tenant["name"])
            settings.UO_DEMO_ENABLED = False
            self.assertEqual((await self.client.post("/api/v1/auth/uo/login", json={"password": "LyceumDemo2026"})).status_code, 403)
            self.assertEqual((await self.client.get("/api/v1/uo/bookings", headers=headers)).status_code, 403)
        finally:
            settings.UO_DEMO_ENABLED = old_enabled

    async def test_catalog_institution_login_provisioning_and_ownership(self):
        school = "ГУО «Средняя школа № 1 г. Минска»"
        school_id = demo_institution_id(school)
        demo_password = "AuditDemoOnly123"
        legacy_hash = hash_password("OldDemoPassword123")
        async with self.sessions() as db:
            lyceum = User(user_id=UO_DEMO_USER_ID, name=UO_DEMO_SCHOOL, phone="", role="master",
                          password_hash=legacy_hash)
            owner = User(user_id="production-owner", name="Отдельная школа", phone="", role="master",
                         password_hash=legacy_hash)
            db.add_all([lyceum, owner])
            await db.flush()
            db.add(RoomListing(
                owner_id=owner.user_id, school=owner.name, type_room="sport_hall", room="Частный зал",
                price=30, available_from=datetime.time(14), available_to=datetime.time(21),
            ))
            await db.flush()
            self.assertEqual(await provision_demo_institutions(db, demo_password), 2)
            await db.commit()
            school_account = await db.scalar(select(User).where(User.user_id == school_id))
            original_ids = lyceum.id, school_account.id
            original_hashes = lyceum.password_hash, school_account.password_hash
            self.assertNotEqual(lyceum.password_hash, legacy_hash)
            self.assertNotEqual(lyceum.password_hash, school_account.password_hash)
            self.assertEqual(owner.password_hash, legacy_hash)
            self.assertEqual(await provision_demo_institutions(db, demo_password), 2)
            await db.commit()
            self.assertEqual((lyceum.id, school_account.id), original_ids)
            self.assertEqual((lyceum.password_hash, school_account.password_hash), original_hashes)
            owners = dict((await db.execute(select(RoomListing.school, RoomListing.owner_id))).all())
            self.assertEqual(owners, {school: school_id, UO_DEMO_SCHOOL: UO_DEMO_USER_ID, owner.name: owner.user_id})

        url = "/api/v1/auth/uo"
        with patch.object(settings, "UO_DEMO_ENABLED", True):
            institutions = await self.client.get(f"{url}/institutions")
            self.assertEqual(institutions.status_code, 200)
            self.assertCountEqual(institutions.json(), [
                {"id": school_id, "name": school}, {"id": UO_DEMO_USER_ID, "name": UO_DEMO_SCHOOL},
            ])
            bad = await self.client.post(f"{url}/login", json={"institution_id": school_id, "password": "incorrect"})
            self.assertEqual(bad.status_code, 401)
            other = await self.client.post(f"{url}/login", json={"institution_id": owner.user_id, "password": demo_password})
            self.assertEqual(other.status_code, 401)
            login = await self.client.post(f"{url}/login", json={"institution_id": school_id, "password": demo_password})
            self.assertEqual(login.status_code, 200, login.text)
            self.assertEqual(login.json()["user"]["user_id"], school_id)
            fallback = await self.client.post(f"{url}/login", json={"password": demo_password})
            self.assertEqual(fallback.json()["user"]["user_id"], UO_DEMO_USER_ID)
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            tenant, tenant_headers = await self.register()
            date = (minsk_now().date() + datetime.timedelta(days=2)).isoformat()
            for school_name, room in [(school, "Спортзал № 1"), (UO_DEMO_SCHOOL, "Спортивный зал")]:
                booking = await self.submit_booking({
                    "school": school_name, "room": room, "type_room": "sport_hall", "date": date,
                    "start_time": "16:00", "user_id": tenant["user_id"],
                }, tenant_headers)
                self.assertEqual(booking.status_code, 201, booking.text)
            school_bookings = await self.client.get("/api/v1/uo/bookings", headers=headers)
            self.assertEqual([item["school"] for item in school_bookings.json()], [school])
            self.assertEqual((await self.client.patch("/api/v1/auth/me", headers=headers, json={
                "first_name": "Лицей", "surname": "БГУ", "phone": "+375291000000",
            })).status_code, 403)

        with patch.object(settings, "UO_DEMO_ENABLED", False):
            self.assertEqual((await self.client.get(f"{url}/institutions")).json(), [])
            self.assertEqual((await self.client.post(f"{url}/login", json={
                "institution_id": school_id, "password": demo_password,
            })).status_code, 403)
            self.assertEqual((await self.client.get("/api/v1/uo/bookings", headers=headers)).status_code, 403)

    async def test_room_photo_upload_scope_validation_and_replacement(self):
        tenant, tenant_headers = await self.register()
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            master = User(user_id="photo-master", name=school, phone="", role="master", rating=5)
            db.add(master)
            await db.flush()
            await db.execute(update(RoomListing).where(RoomListing.school == school).values(owner_id=master.user_id))
            await db.commit()
        master_headers = {"Authorization": f"Bearer {create_access_token('photo-master')}"}
        jpeg = photo_bytes()

        self.assertEqual((await self.client.post("/api/v1/rooms/photo", data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.jpg", jpeg, "image/jpeg")})).status_code, 401)
        tenant_upload = await self.client.post("/api/v1/rooms/photo", headers=tenant_headers, data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.jpg", jpeg, "image/jpeg")})
        self.assertEqual(tenant_upload.status_code, 403)
        wrong_school = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
            "school": "Чужая школа", "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.jpg", jpeg, "image/jpeg")})
        self.assertEqual(wrong_school.status_code, 403)

        invalid_type = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.gif", b"GIF89a", "image/gif")})
        self.assertEqual(invalid_type.status_code, 415)

        first = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.jpg", jpeg, "image/jpeg")})
        self.assertEqual(first.status_code, 200, first.text)
        first_url = first.json()["image_url"]
        self.assertEqual((await self.client.get(first_url)).content, jpeg)

        webp = photo_bytes("WEBP")
        second = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.webp", webp, "image/webp")})
        self.assertEqual(second.status_code, 200, second.text)
        second_url = second.json()["image_url"]
        self.assertNotEqual(first_url, second_url)
        photo = await self.client.get(second_url)
        self.assertEqual(photo.headers["content-type"], "image/webp")
        self.assertEqual(photo.content, webp)

        available = await self.client.get("/api/v1/rooms/available", params={
            "date": minsk_now().date().isoformat(), "type_room": "sport_hall",
        })
        self.assertEqual(available.status_code, 200, available.text)
        room = next(item for item in available.json() if item["school"] == school)
        self.assertEqual(room["image_url"], second_url)

        for corrupt in (b"not-a-jpeg", b"\xff\xd8\xff", jpeg[:-12]):
            bad_photo = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.jpg", corrupt, "image/jpeg")})
            self.assertEqual(bad_photo.status_code, 415)
        with patch.object(room_photos, "MAX_PHOTO_PIXELS", 1):
            too_many_pixels = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.jpg", jpeg, "image/jpeg")})
        self.assertEqual(too_many_pixels.status_code, 413)

        too_large = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
            "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
        }, files={"file": ("room.jpg", b"\xff\xd8\xff" + b"0" * room_photos.MAX_PHOTO_BYTES, "image/jpeg")})
        self.assertEqual(too_large.status_code, 413)

    async def test_uo_can_create_persistent_room_and_clients_can_book_it(self):
        old_enabled = settings.UO_DEMO_ENABLED
        settings.UO_DEMO_ENABLED = True
        try:
            async with self.sessions() as db:
                db.add(User(
                    user_id=UO_DEMO_USER_ID,
                    name=UO_DEMO_SCHOOL,
                    phone="",
                    role="master",
                    rating=5,
                    password_hash=hash_password("LyceumDemo2026"),
                ))
                await db.commit()
            login = await self.client.post("/api/v1/auth/uo/login", json={"password": "LyceumDemo2026"})
            self.assertEqual(login.status_code, 200, login.text)
            master_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            tenant, tenant_headers = await self.register()
            room_data = {
                "school": UO_DEMO_SCHOOL,
                "uo": "Центральный район",
                "type_room": "sport_hall",
                "room": "Новый спортивный зал",
                "address": "Минск, ул. Университетская, 1",
                "city": "Минск",
                "city_district": "Ленинский",
                "capacity": "32",
                "price": "72",
                "available_from": "15:30",
                "available_to": "18:00",
            }
            jpeg = photo_bytes()
            unauthenticated = await self.client.post(
                "/api/v1/rooms", data=room_data,
                files={"file": ("room.jpg", jpeg, "image/jpeg")},
            )
            self.assertEqual(unauthenticated.status_code, 401)
            tenant_create = await self.client.post(
                "/api/v1/rooms", headers=tenant_headers, data=room_data,
                files={"file": ("room.jpg", jpeg, "image/jpeg")},
            )
            self.assertEqual(tenant_create.status_code, 403)
            wrong_school = await self.client.post(
                "/api/v1/rooms", headers=master_headers,
                data={**room_data, "school": "Чужое учреждение"},
                files={"file": ("room.jpg", jpeg, "image/jpeg")},
            )
            self.assertEqual(wrong_school.status_code, 403)

            for invalid_fields in (
                {"capacity": "999999999999999"},
                {"city": "", "city_district": "Ленинский"},
            ):
                invalid = await self.client.post(
                    "/api/v1/rooms", headers=master_headers, data={**room_data, **invalid_fields},
                    files={"file": ("room.jpg", jpeg, "image/jpeg")},
                )
                self.assertEqual(invalid.status_code, 422, invalid.text)

            created = await self.client.post(
                "/api/v1/rooms", headers=master_headers, data=room_data,
                files={"file": ("room.jpg", jpeg, "image/jpeg")},
            )
            self.assertEqual(created.status_code, 201, created.text)
            self.assertEqual(created.json()["owner_id"], UO_DEMO_USER_ID)
            image_url = created.json()["image_url"]
            self.assertEqual((await self.client.get(image_url)).content, jpeg)

            available = await self.client.get("/api/v1/rooms/available", params={
                "date": (minsk_now().date() + datetime.timedelta(days=2)).isoformat(),
                "type_room": "sport_hall",
            })
            self.assertEqual(available.status_code, 200, available.text)
            room = next(item for item in available.json() if item["room"] == room_data["room"])
            self.assertEqual(room["address"], room_data["address"])
            self.assertEqual(room["city"], room_data["city"])
            self.assertEqual(room["city_district"], room_data["city_district"])
            self.assertEqual(room["owner_id"], UO_DEMO_USER_ID)
            self.assertEqual(room["image_url"], image_url)
            self.assertEqual(float(room["price"]), 72)
            self.assertEqual(room["available_slots"][0]["start_time"], "15:30:00")

            too_early = await self.client.post("/api/v1/bookings", headers=tenant_headers, json={
                "school": UO_DEMO_SCHOOL, "room": room_data["room"], "type_room": "sport_hall",
                "date": (minsk_now().date() + datetime.timedelta(days=2)).isoformat(),
                "start_time": "15:00", "hours": 1, "user_id": tenant["user_id"],
            })
            self.assertEqual(too_early.status_code, 400)
            booked = await self.submit_booking({
                "school": UO_DEMO_SCHOOL, "room": room_data["room"], "type_room": "sport_hall",
                "date": (minsk_now().date() + datetime.timedelta(days=2)).isoformat(),
                "start_time": "15:30", "hours": 1, "user_id": tenant["user_id"],
            }, tenant_headers)
            self.assertEqual(booked.status_code, 201, booked.text)
            self.assertEqual(float(booked.json()[0]["price"]), 72)

            duplicate = await self.client.post(
                "/api/v1/rooms", headers=master_headers, data=room_data,
                files={"file": ("room.jpg", jpeg, "image/jpeg")},
            )
            self.assertEqual(duplicate.status_code, 409)
            async with self.sessions() as db:
                listings = (await db.execute(select(RoomListing).where(RoomListing.owner_id == UO_DEMO_USER_ID))).scalars().all()
                self.assertEqual(len(listings), 1)
        finally:
            settings.UO_DEMO_ENABLED = old_enabled

    async def create_managed_room(self):
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            db.add(User(user_id="room-owner", name=school, phone="", role="master"))
            await db.commit()
        headers = {"Authorization": f"Bearer {create_access_token('room-owner')}"}
        fields = {
            "school": school, "uo": "Ленинский район", "type_room": "sport_hall",
            "room": "Зал для тренировок", "address": "Минск, ул. Ульяновская, 8",
            "city": "Минск", "city_district": "Ленинский", "capacity": "32", "price": "60",
            "available_from": "14:00", "available_to": "21:00",
        }
        photo = {"file": ("hall.jpg", photo_bytes(), "image/jpeg")}
        created = await self.client.post("/api/v1/rooms", headers=headers, data=fields, files=photo)
        self.assertEqual(created.status_code, 201, created.text)
        return headers, fields, photo, created.json()

    async def test_uo_room_management_is_owner_scoped_and_update_preserves_photo(self):
        owner_headers, fields, photo, room = await self.create_managed_room()
        _, tenant_headers = await self.register()
        async with self.sessions() as db:
            db.add(User(user_id="another-owner", name="Другая школа", phone="", role="master"))
            await db.commit()
        foreign_headers = {"Authorization": f"Bearer {create_access_token('another-owner')}"}
        url = f"/api/v1/rooms/{room['id']}"
        changes = {
            **fields, "room": "Обновлённый зал", "address": "Минск, ул. Московская, 8",
            "capacity": "48", "price": "72.50", "available_from": "15:30", "available_to": "19:00",
        }
        for method in ("PATCH", "DELETE"):
            for headers, status in (({}, 401), (tenant_headers, 403), (foreign_headers, 404)):
                with self.subTest(method=method, expected_status=status):
                    response = await self.client.request(
                        method, url, headers=headers, data=changes if method == "PATCH" else None,
                    )
                    self.assertEqual(response.status_code, status, response.text)

        invalid = await self.client.patch(url, headers=owner_headers, data={**changes, "available_from": "15:07"})
        self.assertEqual(invalid.status_code, 422, invalid.text)
        updated = await self.client.patch(
            url, headers=owner_headers, files={key: (None, value) for key, value in changes.items()},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        saved = updated.json()
        self.assertEqual(saved["id"], room["id"])
        self.assertEqual(saved["owner_id"], room["owner_id"])
        self.assertEqual(saved["room"], changes["room"])
        self.assertEqual(saved["address"], changes["address"])
        self.assertEqual(saved["capacity"], 48)
        self.assertEqual(float(saved["price"]), 72.5)
        self.assertEqual(saved["available_from"], "15:30:00")
        self.assertEqual(saved["available_to"], "19:00:00")
        self.assertEqual(saved["image_url"], room["image_url"])
        self.assertEqual((await self.client.get(saved["image_url"])).content, photo["file"][1])

        date = minsk_now().date() + datetime.timedelta(days=1)
        catalog = await self.client.get("/api/v1/rooms/catalog", params={"start": date, "days": 1})
        self.assertEqual(catalog.status_code, 200, catalog.text)
        visible = next(item for item in catalog.json() if item["id"] == room["id"])
        self.assertEqual(visible["room"], changes["room"])
        self.assertEqual(visible["available_slots"][0]["start_time"], "15:30:00")
        self.assertEqual(visible["available_slots"][-1]["end_time"], "19:00:00")

        replacement = photo_bytes("PNG")
        with_photo = await self.client.patch(
            url, headers=owner_headers,
            data={"capacity": "", "address": "", "city": "", "city_district": ""},
            files={"file": ("hall.png", replacement, "image/png")},
        )
        self.assertEqual(with_photo.status_code, 200, with_photo.text)
        replaced = with_photo.json()
        for key in ("capacity", "address", "city", "city_district"):
            self.assertIsNone(replaced[key])
        self.assertEqual(replaced["room"], saved["room"])
        self.assertEqual(replaced["price"], saved["price"])
        replacement_url = replaced["image_url"]
        self.assertNotEqual(replacement_url, saved["image_url"])
        self.assertEqual((await self.client.get(replacement_url)).content, replacement)

    async def test_uo_archives_room_after_booking_cancellation_and_can_reuse_name(self):
        owner_headers, fields, photo, room = await self.create_managed_room()
        tenant, tenant_headers = await self.register()
        url = f"/api/v1/rooms/{room['id']}"
        date = minsk_now().date() + datetime.timedelta(days=2)
        order = {
            "school": room["school"], "type_room": room["type_room"], "room": room["room"],
            "date": date.isoformat(), "start_time": "16:00", "hours": 1, "user_id": tenant["user_id"],
        }
        booked = await self.submit_booking(order, tenant_headers)
        self.assertEqual(booked.status_code, 201, booked.text)
        booking_id = booked.json()[0]["id"]
        blocked_update = await self.client.patch(url, headers=owner_headers, data={**fields, "price": "72"})
        self.assertEqual(blocked_update.status_code, 409, blocked_update.text)
        blocked_archive = await self.client.delete(url, headers=owner_headers)
        self.assertEqual(blocked_archive.status_code, 409, blocked_archive.text)
        during_booking = datetime.datetime.combine(date, datetime.time(16, 30), minsk_now().tzinfo)
        with patch("api.routers.room_photos.minsk_now", return_value=during_booking):
            self.assertEqual((await self.client.delete(url, headers=owner_headers)).status_code, 409)
        cancelled = await self.client.patch(f"/api/v1/uo/bookings/{booking_id}/cancel", headers=owner_headers)
        self.assertEqual(cancelled.status_code, 200, cancelled.text)

        tenant_history_url = f"/api/v1/bookings/user/{tenant['user_id']}"
        history = await self.client.get(tenant_history_url, headers=tenant_headers)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(history.json()[0]["listing_id"], room["id"])
        school_history = await self.client.get("/api/v1/uo/bookings", headers=owner_headers)
        self.assertEqual(school_history.status_code, 200, school_history.text)
        self.assertIn(booking_id, [item["id"] for item in school_history.json()])
        for _ in range(2):
            archived = await self.client.delete(url, headers=owner_headers)
            self.assertEqual(archived.status_code, 204, archived.text)
            self.assertEqual(archived.content, b"")
        self.assertEqual((await self.client.patch(url, headers=owner_headers, data=fields)).status_code, 404)
        for public_url, params in (
            ("/api/v1/rooms/catalog", {"start": date, "days": 1}),
            ("/api/v1/rooms/available", {"date": date, "type_room": room["type_room"]}),
        ):
            public = await self.client.get(public_url, params=params)
            self.assertEqual(public.status_code, 200, public.text)
            self.assertNotIn(room["id"], [item["id"] for item in public.json()])
        self.assertEqual((await self.submit_booking(order, tenant_headers)).status_code, 404)
        self.assertEqual((await self.client.get(room["image_url"])).status_code, 404)
        async with self.sessions() as db:
            preserved_photo = await db.scalar(select(RoomListing.photo_data).where(RoomListing.id == room["id"]))
            self.assertEqual(preserved_photo, photo["file"][1])

        recreated = await self.client.post("/api/v1/rooms", headers=owner_headers, data=fields, files=photo)
        self.assertEqual(recreated.status_code, 201, recreated.text)
        self.assertNotEqual(recreated.json()["id"], room["id"])
        persisted_history = await self.client.get(tenant_history_url, headers=tenant_headers)
        self.assertEqual(persisted_history.status_code, 200, persisted_history.text)
        self.assertEqual(persisted_history.json(), history.json())
        persisted_school_history = await self.client.get("/api/v1/uo/bookings", headers=owner_headers)
        self.assertEqual(persisted_school_history.status_code, 200, persisted_school_history.text)
        self.assertEqual(persisted_school_history.json(), school_history.json())
        stale_booking = await self.submit_booking({**order, "listing_id": room["id"]}, tenant_headers)
        self.assertEqual(stale_booking.status_code, 404, stale_booking.text)
        new_booking = await self.submit_booking({**order, "listing_id": recreated.json()["id"]}, tenant_headers)
        self.assertEqual(new_booking.status_code, 201, new_booking.text)
        self.assertEqual(new_booking.json()[0]["listing_id"], recreated.json()["id"])

    async def test_uo_room_mutation_blocks_recurring_reservation_until_last_visit_ends(self):
        owner_headers, fields, _, room = await self.create_managed_room()
        date = minsk_now().date() + datetime.timedelta(days=2)
        ends_on = date + datetime.timedelta(days=1)
        reservations_url = "/api/v1/uo/weekly-reservations"
        reservation = {
            "listing_id": room["id"], "date": date.isoformat(),
            "start_time": "16:00", "label": "Тренировка", "ends_on": ends_on.isoformat(),
        }
        created = await self.client.post(reservations_url, headers=owner_headers, json=reservation)
        self.assertEqual(created.status_code, 201, created.text)
        url = f"/api/v1/rooms/{room['id']}"
        self.assertEqual((await self.client.patch(url, headers=owner_headers, data=fields)).status_code, 409)
        self.assertEqual((await self.client.delete(url, headers=owner_headers)).status_code, 409)
        after_last_visit = datetime.datetime.combine(date, datetime.time(17), minsk_now().tzinfo)
        with patch("api.routers.room_photos.minsk_now", return_value=after_last_visit):
            archived = await self.client.delete(url, headers=owner_headers)
        self.assertEqual(archived.status_code, 204, archived.text)
        self.assertEqual((await self.client.post(reservations_url, headers=owner_headers, json=reservation)).status_code, 404)


if __name__ == "__main__":
    unittest.main()
