from pydantic import BaseModel, EmailStr


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


class UserResponse(BaseModel):
    id: str
    venue_id: str
    full_name: str
    email: str
    role: str
    zone: str | None
    is_active: bool

    model_config = {"from_attributes": True}
