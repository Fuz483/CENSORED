from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers import bookings, finance, guard, users
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

app.include_router(users.router)
app.include_router(bookings.router)
app.include_router(guard.router)
app.include_router(finance.router)


@app.get("/health", tags=["Системные проверки"])
async def health_check() -> dict[str, str]:
    """Проверка работоспособности сервиса."""
    return {"status": "ok", "service": "SmartSpace Backend v2.0"}