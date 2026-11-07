from base64 import b64encode
from collections import OrderedDict
from io import BytesIO
import random
import secrets
import string
from time import monotonic

from PIL import Image, ImageDraw, ImageFont

TTL_SECONDS = 180
MAX_CHALLENGES = 2048
_challenges: OrderedDict[str, tuple[str, float]] = OrderedDict()
_font = ImageFont.load_default(size=32)
_random = random.SystemRandom()


def issue_challenge() -> dict[str, str]:
    answer = "".join(secrets.choice(string.digits) for _ in range(5))
    challenge_id = secrets.token_urlsafe(24)
    now = monotonic()
    while _challenges and (
        len(_challenges) >= MAX_CHALLENGES or next(iter(_challenges.values()))[1] <= now
    ):
        _challenges.popitem(last=False)
    _challenges[challenge_id] = (answer, now + TTL_SECONDS)

    image = Image.new("RGB", (172, 56), "#f4f0e7")
    draw = ImageDraw.Draw(image)
    for index, digit in enumerate(answer):
        draw.text((13 + 30 * index, _random.randint(4, 15)), digit, font=_font, fill="#182d40")
    for _ in range(3):
        draw.line((0, _random.randrange(56), 172, _random.randrange(56)), fill="#8a948f", width=1)
    for _ in range(95):
        draw.point((_random.randrange(172), _random.randrange(56)), fill="#9b9d94")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return {"id": challenge_id, "image": f"data:image/png;base64,{b64encode(buffer.getvalue()).decode('ascii')}"}


def verify_challenge(challenge_id: str, answer: str) -> bool:
    challenge = _challenges.pop(challenge_id, None)
    return challenge is not None and monotonic() < challenge[1] and secrets.compare_digest(challenge[0], answer)
