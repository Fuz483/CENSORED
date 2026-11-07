from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api.request_limits import RequestBodyLimit
from api.routers import auth, bookings, finance, guard, health, privacy, room_photos, users
from core.config import settings

app = FastAPI(
    title="SmartSpace Platform API",
    description="Серверная часть платформы автоматизации аренды помещений учебных заведений",
    version="2.0.0",
)

app.add_middleware(RequestBodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
    details = [{key: item[key] for key in ("loc", "msg", "type")} for item in error.errors()]
    return JSONResponse({"detail": details}, status_code=422, headers={"Cache-Control": "no-store"})

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(bookings.router)
app.include_router(guard.router)
app.include_router(health.router)
app.include_router(privacy.router)
app.include_router(finance.router)
app.include_router(room_photos.router)
app.include_router(room_photos.media_router)
app.include_router(room_photos.legacy_media_router)


@app.get("/health", tags=["Системные проверки"])
async def health_check() -> dict[str, str]:
    """Проверка работоспособности сервиса."""
    return {"status": "ok", "service": "SmartSpace Backend v2.0"}


frontend_dir = settings.FRONTEND_DIST
if frontend_dir is not None:
    @app.get("/guard", include_in_schema=False)
    @app.get("/privacy", include_in_schema=False)
    async def frontend_page() -> FileResponse:
        return FileResponse(frontend_dir / "index.html", headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
