from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    full_name: str = ""
    phone: str = ""
    role: str = "user"

class LoginIn(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: str
    phone: str
    role: str
    is_active: bool

class RoomBase(BaseModel):
    title: str
    description: str = ""
    price: float = 0
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

class RoomList(BaseModel):
    items: list[RoomOut]
    total: int
