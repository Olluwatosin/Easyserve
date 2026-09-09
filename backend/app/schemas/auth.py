from pydantic import BaseModel, EmailStr, model_validator


class PinLoginRequest(BaseModel):
    venue_slug: str
    pin: str


class SetPinRequest(BaseModel):
    pin: str


class RegisterRequest(BaseModel):
    venue_name: str
    venue_city: str | None = None
    venue_phone: str | None = None
    full_name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    """Exactly one of email or phone. Phone sends a WhatsApp code."""
    email: EmailStr | None = None
    phone: str | None = None

    @model_validator(mode="after")
    def _exactly_one(self) -> "ForgotPasswordRequest":
        if bool(self.email) == bool(self.phone):
            raise ValueError("Provide either an email address or a phone number")
        return self


class ResetPasswordRequest(BaseModel):
    """`token` is the emailed link token or the 6-digit WhatsApp code. When it
    is a code, `phone` must accompany it so a wrong guess can be charged
    against that account's attempt cap."""
    token: str
    new_password: str
    phone: str | None = None


class SetPhoneRequest(BaseModel):
    phone: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserResponse(BaseModel):
    id: str
    venue_id: str
    full_name: str
    email: str
    phone: str | None = None
    role: str
    zone: str | None
    is_active: bool

    model_config = {"from_attributes": True}
