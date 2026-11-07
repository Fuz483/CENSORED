from collections import deque

from fastapi.security.utils import get_authorization_scheme_param
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from core.security import decode_access_token

MAX_API_BODY_BYTES = 64 * 1024
MAX_ROOM_BODY_BYTES = 9 * 1024 * 1024


class RequestBodyLimit:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PATCH", "PUT", "DELETE"}:
            await self.app(scope, receive, send)
            return

        path = scope["path"].removeprefix(scope.get("root_path", "")).rstrip("/")
        if not path.startswith("/api/v1/"):
            await self.app(scope, receive, send)
            return
        room_form = (scope["method"] == "POST" and path in {"/api/v1/rooms", "/api/v1/rooms/photo"}) or (
            scope["method"] == "PATCH" and path.startswith("/api/v1/rooms/")
        )
        headers = Headers(scope=scope)
        if room_form:
            scheme, token = get_authorization_scheme_param(headers.get("authorization"))
            if scheme.lower() != "bearer" or len(token) > 4096 or decode_access_token(token) is None:
                await JSONResponse({"detail": "Войдите в аккаунт."}, status_code=401,
                                   headers={"WWW-Authenticate": "Bearer"})(scope, receive, send)
                return

        maximum = MAX_ROOM_BODY_BYTES if room_form else MAX_API_BODY_BYTES
        too_large = JSONResponse({"detail": "Размер запроса превышает допустимый предел."}, status_code=413)
        try:
            declared_size = int(headers.get("content-length", "0"))
        except ValueError:
            await JSONResponse({"detail": "Некорректный размер запроса."}, status_code=400)(scope, receive, send)
            return
        if declared_size > maximum:
            await too_large(scope, receive, send)
            return

        # Check the real size before passing any bytes to the JSON or multipart parser.
        chunks = deque()
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > maximum:
                await too_large(scope, receive, send)
                return
            chunks.append(message)
            if not message.get("more_body", False):
                break

        async def replay():
            return chunks.popleft() if chunks else await receive()

        await self.app(scope, replay, send)
