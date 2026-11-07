import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator
from core.phones import normalize_phone

PhoneNumber = Annotated[str, Field(min_length=7, max_length=32), AfterValidator(normalize_phone)]
NamePart = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalPatronymic = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


def normalize_email(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    email = value.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Укажите корректный адрес электронной почты.")
    return email


class RegisterRequest(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=255)]
    phone: PhoneNumber
    password: str = Field(..., min_length=8, max_length=128)
    captcha_id: str = Field(..., min_length=32, max_length=32)
    captcha_answer: str = Field(..., pattern=r"^[0-9]{5}$")
    surname: NamePart | None = None
    first_name: NamePart | None = None
    patronymic: OptionalPatronymic | None = None
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value)


class ProfileUpdateRequest(BaseModel):
    surname: NamePart
    first_name: NamePart
    patronymic: OptionalPatronymic | None = None
    phone: PhoneNumber
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value)


class LoginRequest(BaseModel):
    phone: str = Field(min_length=7, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        normalize_phone(value)
        return value.strip()


class UoLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    institution_id: str | None = Field(default=None, min_length=1, max_length=64)


class UoInstitution(BaseModel):
    id: str
    name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
