from base64 import b64encode
import hmac
from io import BytesIO
import random
import secrets
import string
from time import time

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from core.config import settings
from db.models import CaptchaChallenge

TTL_SECONDS = 180
_random = random.SystemRandom()
_ink = ("#182d40", "#234846", "#433344", "#494334")


def answer_digest(challenge_id: str, answer: str) -> str:
    message = f"captcha:{challenge_id}:{answer}".encode()
    return hmac.digest(settings.JWT_SECRET_KEY.encode(), message, "sha256").hex()


def render_challenge(answer: str) -> str:
    image = Image.new("RGB", (172, 56), "#f4f0e7")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=32)
    for _ in range(90):
        x, y = _random.randrange(172), _random.randrange(56)
        draw.line((x, y, x + _random.randrange(2, 6), y + _random.randrange(-3, 4)),
                  fill=_random.choice(("#8a948f", "#9b9d94", "#bd9f86")))
    for index, digit in enumerate(answer):
        mask = Image.new("L", (32, 42))
        ImageDraw.Draw(mask).text((5, 2), digit, font=font, fill=255)
        mask = mask.resize((_random.randint(25, 35), _random.randint(38, 47)), Image.Resampling.BICUBIC)
        mask = mask.rotate(_random.randint(-28, 28), Image.Resampling.BICUBIC, expand=True)
        x = 21 + index * 32 - mask.width // 2 + _random.randint(-4, 4)
        y = (56 - mask.height) // 2 + _random.randint(-4, 4)
        image.paste(_random.choice(_ink), (x, y, x + mask.width, y + mask.height), mask)
    for _ in range(3):
        draw.line([(x, _random.randint(14, 43)) for x in range(0, 182, 22)], fill=_random.choice(_ink), width=1)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return f"data:image/png;base64,{b64encode(buffer.getvalue()).decode('ascii')}"


async def issue_challenge(db: AsyncSession) -> dict[str, str]:
    answer = "".join(secrets.choice(string.digits) for _ in range(5))
    challenge_id = secrets.token_urlsafe(24)
    image = await run_in_threadpool(render_challenge, answer)
    now = int(time())
    await db.execute(delete(CaptchaChallenge).where(CaptchaChallenge.expires_at <= now))
    db.add(CaptchaChallenge(challenge_id=challenge_id, answer_digest=answer_digest(challenge_id, answer),
                            expires_at=now + TTL_SECONDS))
    await db.commit()
    return {"id": challenge_id, "image": image}


async def verify_challenge(db: AsyncSession, challenge_id: str, answer: str) -> bool:
    challenge = (await db.execute(delete(CaptchaChallenge).where(
        CaptchaChallenge.challenge_id == challenge_id,
    ).returning(CaptchaChallenge.answer_digest, CaptchaChallenge.expires_at))).one_or_none()
    await db.commit()
    return (challenge is not None and time() < challenge.expires_at
            and secrets.compare_digest(challenge.answer_digest, answer_digest(challenge_id, answer)))
