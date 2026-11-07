"""Contract integration tests with an isolated in-memory DB (no live data)."""
import datetime
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db.database import Base, get_db
from main import app
from core.config import settings
from core.security import create_access_token, hash_password
from core.uo_demo import UO_DEMO_SCHOOL, UO_DEMO_USER_ID
from db.models import Booking, RoomListing, User
from api.routers import room_photos
from api.routers.bookings import minsk_now


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

        async with self.sessions() as db:
            row = await db.get(Booking, booking["id"])
            row.date = today
            await db.commit()
        valid_today = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(valid_today.status_code, 200, valid_today.text)
        self.assertTrue(valid_today.json()["access_granted"])
        self.assertEqual(valid_today.json()["user"]["name"], user["name"])

        async with self.sessions() as db:
            row = await db.get(Booking, booking["id"])
            row.state = "pending"
            await db.commit()
        unconfirmed = await self.client.post(scan_url, json={"code": booking["code"]})
        self.assertEqual(unconfirmed.status_code, 200, unconfirmed.text)
        self.assertFalse(unconfirmed.json()["access_granted"])
        self.assertIn("не подтверждена", unconfirmed.json()["reason"])

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

    async def test_room_photo_upload_scope_validation_and_replacement(self):
        tenant, tenant_headers = await self.register()
        school = "ГУО «Средняя школа № 1 г. Минска»"
        async with self.sessions() as db:
            master = User(user_id="photo-master", name=school, phone="", role="master", rating=5)
            db.add(master)
            await db.commit()
        master_headers = {"Authorization": f"Bearer {create_access_token('photo-master')}"}
        jpeg = b"\xff\xd8\xff\xe0room-photo-test\xff\xd9"

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

        with tempfile.TemporaryDirectory() as upload_dir, patch.object(room_photos, "PHOTO_DIR", Path(upload_dir)):
            invalid_type = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.gif", b"GIF89a", "image/gif")})
            self.assertEqual(invalid_type.status_code, 415)

            first = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.jpg", jpeg, "image/jpeg")})
            self.assertEqual(first.status_code, 200, first.text)
            first_url = first.json()["image_url"]
            self.assertTrue((Path(upload_dir) / Path(first_url).name).is_file())

            second = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.webp", b"RIFF\x00\x00\x00\x00WEBPtest", "image/webp")})
            self.assertEqual(second.status_code, 200, second.text)
            second_url = second.json()["image_url"]
            self.assertNotEqual(first_url, second_url)
            self.assertFalse((Path(upload_dir) / Path(first_url).name).exists())
            self.assertTrue((Path(upload_dir) / Path(second_url).name).is_file())

            available = await self.client.get("/api/v1/rooms/available", params={
                "date": minsk_now().date().isoformat(), "type_room": "sport_hall",
            })
            self.assertEqual(available.status_code, 200, available.text)
            room = next(item for item in available.json() if item["school"] == school)
            self.assertEqual(room["image_url"], second_url)

            bad_signature = await self.client.post("/api/v1/rooms/photo", headers=master_headers, data={
                "school": school, "type_room": "sport_hall", "room": "Спортзал № 1",
            }, files={"file": ("room.jpg", b"not-a-jpeg", "image/jpeg")})
            self.assertEqual(bad_signature.status_code, 415)

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
            jpeg = b"\xff\xd8\xff\xe0new-room-photo-test\xff\xd9"
            with tempfile.TemporaryDirectory() as upload_dir, patch.object(room_photos, "PHOTO_DIR", Path(upload_dir)):
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
                self.assertTrue((Path(upload_dir) / Path(image_url).name).is_file())

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


if __name__ == "__main__":
    unittest.main()
