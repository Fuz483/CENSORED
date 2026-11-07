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


class ApiContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

        async def database():
            async with self.sessions() as session:
                yield session

        app.dependency_overrides[get_db] = database
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        app.dependency_overrides.clear()
        await self.engine.dispose()

    async def register(self, phone="+375291234567"):
        response = await self.client.post("/api/v1/auth/register", json={
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
                "date": datetime.date.today().isoformat(), "type_room": room_type,
            })
            self.assertEqual(available.status_code, 200, available.text)
        self.assertEqual((await self.client.post("/api/v1/bookings", json={})).status_code, 401)

    async def test_registration_and_profile_update(self):
        response = await self.client.post("/api/v1/auth/register", json={
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
            "name": "Пользователь", "phone": "+375291234569",
            "password": "TestPassword123", "email": "not-an-email",
        })
        self.assertEqual(invalid_email.status_code, 422)

    async def test_booking_availability_cancel_and_rebook(self):
        user, headers = await self.register()
        date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
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
            **payload, "date": (datetime.date.today() - datetime.timedelta(days=1)).isoformat(),
        })
        self.assertEqual(past.status_code, 400)
        for invalid in (0.75, 1.1):
            response = await self.client.post("/api/v1/bookings", headers=headers, json={**payload, "hours": invalid})
            self.assertEqual(response.status_code, 422, response.text)
        created = await self.client.post("/api/v1/bookings", headers=headers, json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        booking = created.json()[0]
        self.assertEqual(booking["state"], "confirmed")
        self.assertTrue(booking["code"])
        self.assertEqual(float(booking["price"]), 56.25)
        self.assertEqual(booking["end_time"], "15:30:00")
        collision = await self.client.post("/api/v1/bookings", headers=headers, json=payload)
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
        rebooked = await self.client.post("/api/v1/bookings", headers=headers, json=payload)
        self.assertEqual(rebooked.status_code, 201, rebooked.text)

    async def test_booking_creation_issues_qr_and_guard_checks_booking_date(self):
        user, headers = await self.register()
        other_user, other_headers = await self.register("+375291234569")
        today = datetime.date.today()
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

        created = await self.client.post("/api/v1/bookings", headers=headers, json=payload)
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
            date = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
            for school, room in [(UO_DEMO_SCHOOL, "Спортивный зал"), ("ГУО «Средняя школа № 1 г. Минска»", "Спортзал № 1")]:
                response = await self.client.post("/api/v1/bookings", headers=tenant_headers, json={
                    "school": school, "room": room, "type_room": "sport_hall", "date": date,
                    "start_time": "14:15", "hours": 1.25, "user_id": tenant["user_id"],
                })
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
                "date": datetime.date.today().isoformat(), "type_room": "sport_hall",
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

                created = await self.client.post(
                    "/api/v1/rooms", headers=master_headers, data=room_data,
                    files={"file": ("room.jpg", jpeg, "image/jpeg")},
                )
                self.assertEqual(created.status_code, 201, created.text)
                self.assertEqual(created.json()["owner_id"], UO_DEMO_USER_ID)
                image_url = created.json()["image_url"]
                self.assertTrue((Path(upload_dir) / Path(image_url).name).is_file())

                available = await self.client.get("/api/v1/rooms/available", params={
                    "date": (datetime.date.today() + datetime.timedelta(days=2)).isoformat(),
                    "type_room": "sport_hall",
                })
                self.assertEqual(available.status_code, 200, available.text)
                room = next(item for item in available.json() if item["room"] == room_data["room"])
                self.assertEqual(room["address"], room_data["address"])
                self.assertEqual(room["owner_id"], UO_DEMO_USER_ID)
                self.assertEqual(room["image_url"], image_url)
                self.assertEqual(float(room["price"]), 72)
                self.assertEqual(room["available_slots"][0]["start_time"], "15:30:00")

                too_early = await self.client.post("/api/v1/bookings", headers=tenant_headers, json={
                    "school": UO_DEMO_SCHOOL, "room": room_data["room"], "type_room": "sport_hall",
                    "date": (datetime.date.today() + datetime.timedelta(days=2)).isoformat(),
                    "start_time": "15:00", "hours": 1, "user_id": tenant["user_id"],
                })
                self.assertEqual(too_early.status_code, 400)
                booked = await self.client.post("/api/v1/bookings", headers=tenant_headers, json={
                    "school": UO_DEMO_SCHOOL, "room": room_data["room"], "type_room": "sport_hall",
                    "date": (datetime.date.today() + datetime.timedelta(days=2)).isoformat(),
                    "start_time": "15:30", "hours": 1, "user_id": tenant["user_id"],
                })
                self.assertEqual(booked.status_code, 201, booked.text)
                self.assertEqual(float(booked.json()[0]["price"]), 72)

                duplicate = await self.client.post(
                    "/api/v1/rooms", headers=master_headers, data=room_data,
                    files={"file": ("room.jpg", jpeg, "image/jpeg")},
                )
                self.assertEqual(duplicate.status_code, 409)
                async with self.sessions() as db:
                    listings = (await db.execute(select(RoomListing))).scalars().all()
                    self.assertEqual(len(listings), 1)
        finally:
            settings.UO_DEMO_ENABLED = old_enabled


if __name__ == "__main__":
    unittest.main()
