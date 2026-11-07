import re

from pydantic import BaseModel, Field, field_validator


def normalize_email(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    email = value.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise ValueError("Укажите корректный адрес электронной почты.")
    return email


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    phone: str = Field(..., min_length=7, max_length=32)
    password: str = Field(..., min_length=8, max_length=128)
    captcha_id: str = Field(..., min_length=32, max_length=32)
    captcha_answer: str = Field(..., pattern=r"^[0-9]{5}$")
    surname: str | None = Field(default=None, min_length=1, max_length=100)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    patronymic: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value)


class ProfileUpdateRequest(BaseModel):
    surname: str = Field(..., min_length=1, max_length=100)
    first_name: str = Field(..., min_length=1, max_length=100)
    patronymic: str | None = Field(default=None, max_length=100)
    phone: str = Field(..., min_length=7, max_length=32)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value)


class LoginRequest(BaseModel):
    phone: str = Field(..., min_length=7, max_length=32)
    password: str = Field(..., min_length=1, max_length=128)


class UoLoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
