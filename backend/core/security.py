import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from core.config import settings

ALGORITHM = "HS256"


@dataclass(frozen=True)
class AccessSession:
    user_id: str
    token_id: str
    expires_at: int


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_hex, digest_hex = encoded.split("$", 2)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 310_000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES)
    return jwt.encode(
        {"sub": user_id, "jti": secrets.token_hex(16), "exp": expires},
        settings.JWT_SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> AccessSession | None:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM], options={"require": ["sub", "jti", "exp"]},
        )
    except jwt.InvalidTokenError:
        return None
    if not payload["sub"] or len(payload["jti"]) != 32 or type(payload["exp"]) is not int:
        return None
    return AccessSession(payload["sub"], payload["jti"], payload["exp"])
