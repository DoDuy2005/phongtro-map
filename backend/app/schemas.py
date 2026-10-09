from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from .models import UserRole

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class RegisterResult(BaseModel):
    message: str

class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(default="", max_length=50)
    role: UserRole = UserRole.USER

class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str
    role: UserRole | None = None

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: str
    phone: str
    role: str
    is_active: bool
    is_email_verified: bool

class RoomBase(BaseModel):
    title: str
    description: str = ""
    price: float = 0
    room_count: int = Field(default=1, ge=1, le=500)
    available_count: int | None = Field(default=None, ge=0, le=500)
    area: float | None = None
    region: str = "Hà Nội"
    district: str = ""
    ward: str = ""
    street: str = ""
    address: str = ""
    lat: float | None = None
    lon: float | None = None
    images: list[str] = []
    amenities: list[str] = []
    phone: str = ""
    seller_name: str = ""
    available: bool = True
    status: str = "ACTIVE"
    source_url: str | None = None

class RoomCreate(RoomBase):
    pass

class RoomOut(RoomBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    source: str
    source_id: str | None
    landlord_id: UUID | None
    created_at: datetime
    updated_at: datetime
    is_favorite: bool = False
    uploaded_images: list[str] = Field(default_factory=list)

class RoomList(BaseModel):
    items: list[RoomOut]
    total: int
