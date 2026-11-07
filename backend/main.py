from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from api.routers import auth, bookings, finance, guard, room_photos, users
from core.config import settings

app = FastAPI(
    title="SmartSpace Platform API",
    description="Серверная часть платформы автоматизации аренды помещений учебных заведений",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROOM_PHOTO_DIR = Path(__file__).resolve().parent / "uploads" / "room-photos"
ROOM_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media/rooms", StaticFiles(directory=ROOM_PHOTO_DIR), name="room-photos")

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(bookings.router)
app.include_router(guard.router)
app.include_router(finance.router)
app.include_router(room_photos.router)
app.include_router(room_photos.media_router)


@app.get("/health", tags=["Системные проверки"])
async def health_check() -> dict[str, str]:
    """Проверка работоспособности сервиса."""
    return {"status": "ok", "service": "SmartSpace Backend v2.0"}
