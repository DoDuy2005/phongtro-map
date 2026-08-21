import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

class UserRole(str, enum.Enum):
    USER = "user"
    LANDLORD = "landlord"
    ADMIN = "admin"

class RoomStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    HIDDEN = "hidden"
    REJECTED = "rejected"

class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(30), default="manual", index=True)
    source_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    price: Mapped[float] = mapped_column(Float, default=0)
    area: Mapped[float | None] = mapped_column(Float, nullable=True)
    region: Mapped[str] = mapped_column(String(100), default="Hà Nội")
    district: Mapped[str] = mapped_column(String(100), default="")
    ward: Mapped[str] = mapped_column(String(100), default="")
    street: Mapped[str] = mapped_column(String(200), default="")
    address: Mapped[str] = mapped_column(String(500), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=True), nullable=True)
    images: Mapped[list] = mapped_column(JSON, default=list)
    amenities: Mapped[list] = mapped_column(JSON, default=list)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    phone: Mapped[str] = mapped_column(String(50), default="")
    seller_name: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[RoomStatus] = mapped_column(Enum(RoomStatus), default=RoomStatus.ACTIVE, index=True)
    available: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    landlord_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    landlord = relationship("User", back_populates="rooms")
    favorites = relationship("Favorite", back_populates="room", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_room_source_id"),
    )

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    rooms = relationship("Room", back_populates="landlord")
    favorites = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")

class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="favorites")
    room = relationship("Room", back_populates="favorites")

    __table_args__ = (
        UniqueConstraint("user_id", "room_id", name="uq_favorite"),
    )
