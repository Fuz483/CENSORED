from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routers import bookings, finance, users
from core.config import settings

app = FastAPI(
    title="SmartSpace Platform API",
    description="Серверная часть платформы автоматизации аренды помещений учебных заведений",
    version="1.0.0",
)

# Настройка политики CORS для взаимодействия с клиентским приложением (http://localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Регистрация маршрутизаторов API
app.include_router(users.router)
app.include_router(bookings.router)
app.include_router(finance.router)


@app.get("/health", tags=["Системные проверки"])
async def health_check() -> dict[str, str]:
    """Проверка работоспособности сервиса."""
    return {"status": "ok", "service": "SmartSpace Backend"}