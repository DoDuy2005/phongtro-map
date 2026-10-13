from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Lock
from typing import Literal
from uuid import UUID
import secrets

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Text, cast, func, or_
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db, SessionLocal, ensure_email_verification_columns, ensure_room_count_column, ensure_available_count_column, ensure_room_street_length, ensure_favorite_snapshots
from .models import User, UserRole, Room, RoomStatus, RoomImage, Favorite, RoomRetentionSetting, RoomExpiryReminder, CrawlerCursor
from .schemas import Token, RegisterIn, LoginIn, UserOut, RoomCreate, RoomOut, RoomList, RegisterResult, RoomRetentionUpdate, RoomAvailabilityConfirmation
from .auth import hash_password, verify_password, create_token, current_user, optional_current_user, require_role
from .crawler_service import crawl_once
from .email_service import send_verification_email, send_room_availability_email

scheduler = BackgroundScheduler()
crawler_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="crawler")
crawler_lock = Lock()
crawler_state_lock = Lock()
crawler_state = {"status": "idle", "result": None, "error": None}

def update_crawler_state(**changes):
    global crawler_state
    with crawler_state_lock:
        crawler_state = {**crawler_state, **changes}

def run_crawler_task():
    crawler_lock.acquire()
    update_crawler_state(status="running", progress=0, processed=0, target=10, stage="Đang kết nối Nhà Tốt", result=None, error=None)
    db = SessionLocal()
    try:
        result = crawl_once(db, max_records=10, progress_callback=update_crawler_state, geocode_missing=False, only_new=True)
        update_crawler_state(status="completed", progress=100, stage="Hoàn tất", result=result, error=None)
    except Exception as exc:
        db.rollback()
        update_crawler_state(status="failed", result=None, error=str(exc))
        print("Crawler error:", exc)
    finally:
        db.close()
        crawler_lock.release()

def scheduled_crawl_job(job_name, max_records, only_new, geocode_missing=True, cursor_key=None, repeat_cursor=False):
    if not crawler_lock.acquire(blocking=False):
        print(f"Crawler {job_name} skipped: another crawl is running")
        return
    db = SessionLocal()
    try:
        start_offset = 0
        cursor = None
        if cursor_key:
            cursor = db.get(CrawlerCursor, cursor_key)
            if cursor is None:
                cursor = CrawlerCursor(key=cursor_key, offset=0, completed=False)
                db.add(cursor)
                db.commit()
            if cursor.completed:
                if not repeat_cursor:
                    return
                cursor.offset = 0
                cursor.completed = False
                db.commit()
            start_offset = cursor.offset
        result = crawl_once(
            db,
            max_records=max_records,
            only_new=only_new,
            geocode_missing=geocode_missing,
            start_offset=start_offset,
        )
        if cursor is not None:
            cursor.offset = result["next_offset"]
            cursor.completed = result["backfill_complete"] and not repeat_cursor
            db.commit()
        print(f"Crawler {job_name} completed: {result}")
    except Exception as exc:
        db.rollback()
        print("Crawler error:", exc)
    finally:
        db.close()
        crawler_lock.release()

def scheduled_incremental_crawl():
    scheduled_crawl_job("incremental", max_records=100, only_new=True)

def scheduled_daily_refresh():
    scheduled_crawl_job(
        "daily refresh",
        max_records=100,
        only_new=False,
        cursor_key="nhatot_daily_refresh",
        repeat_cursor=True,
    )

def scheduled_backfill():
    scheduled_crawl_job("backfill", max_records=200, only_new=True, cursor_key="nhatot_hanoi")

def delete_expired_rooms(db: Session, days: int) -> int:
    cutoff = datetime.utcnow() - timedelta(days=days)
    expired = db.query(Room).filter(Room.source == "nhatot", Room.created_at < cutoff).all()
    if not expired:
        return 0
    for room in expired:
        preserve_room_favorites(db, room)
    room_ids = [room.id for room in expired]
    return db.query(Room).filter(Room.id.in_(room_ids)).delete(synchronize_session=False)

def send_expired_room_reminders(db: Session, days: int) -> None:
    cutoff = datetime.utcnow() - timedelta(days=days)
    expired_rooms = db.query(Room).filter(
        Room.source == "manual",
        Room.landlord_id.isnot(None),
        Room.status == RoomStatus.ACTIVE,
        Room.available_count > 0,
        Room.created_at < cutoff,
    ).all()
    for room in expired_rooms:
        reminder = db.get(RoomExpiryReminder, room.id)
        if reminder and reminder.sent_at >= room.created_at:
            continue
        landlord = db.get(User, room.landlord_id)
        if not landlord or not landlord.email:
            continue
        try:
            send_room_availability_email(landlord.email, landlord.full_name, room.title, days)
            if reminder:
                reminder.sent_at = datetime.utcnow()
            else:
                db.add(RoomExpiryReminder(room_id=room.id, sent_at=datetime.utcnow()))
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"Room expiry reminder failed for {room.id}: {exc}")

def scheduled_room_cleanup():
    db = SessionLocal()
    try:
        setting = db.get(RoomRetentionSetting, 1)
        if setting and setting.days:
            deleted = delete_expired_rooms(db, setting.days)
            if deleted:
                db.commit()
                print(f"Room retention cleanup removed {deleted} expired rooms")
            send_expired_room_reminders(db, setting.days)
    except Exception as exc:
        db.rollback()
        print("Room retention cleanup error:", exc)
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_email_verification_columns()
    ensure_room_count_column()
    ensure_available_count_column()
    ensure_room_street_length()
    ensure_favorite_snapshots()
    scheduler.add_job(scheduled_room_cleanup, "interval", hours=1, id="room-retention", replace_existing=True, next_run_time=datetime.utcnow())
    if settings.crawler_enabled:
        scheduler.add_job(scheduled_incremental_crawl, "interval", minutes=settings.crawler_interval_minutes, id="nhatot-incremental", replace_existing=True)
        scheduler.add_job(scheduled_daily_refresh, "interval", hours=settings.crawler_refresh_interval_hours, id="nhatot-daily-refresh", replace_existing=True)
        scheduler.add_job(scheduled_backfill, "interval", hours=settings.crawler_backfill_interval_hours, id="nhatot-backfill", replace_existing=True)
    scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)

app = FastAPI(title="PhongTro Map API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/auth/register", response_model=RegisterResult)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if payload.role not in (UserRole.USER, UserRole.LANDLORD):
        raise HTTPException(400, "Only customer and landlord registration is allowed")
    email = payload.email.strip().lower()
    verification_token = secrets.token_urlsafe(48)
    user = db.query(User).filter(User.email == email, User.role == payload.role).first()
    if user and user.is_email_verified:
        raise HTTPException(400, "Email already exists")
    if user:
        user.email_verification_token = verification_token
    else:
        user = User(
            email=email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            phone=payload.phone,
            role=payload.role,
            is_email_verified=False,
            email_verification_token=verification_token,
        )
        db.add(user)
    db.commit()
    db.refresh(user)
    try:
        send_verification_email(user.email, user.full_name, verification_token)
    except Exception as exc:
        raise HTTPException(
            503,
            f"Email delivery failed: {exc}",
        ) from exc
    return {"message": "Đã gửi email xác nhận. Hãy mở liên kết trong email để kích hoạt tài khoản."}

@app.post("/api/auth/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    query = db.query(User).filter(User.email == payload.email.strip().lower())
    if payload.role is not None:
        query = query.filter(User.role == payload.role)
    users = query.all()
    if not users:
        raise HTTPException(401, "Invalid email or password")
    if len(users) > 1:
        raise HTTPException(400, "Email có nhiều tài khoản. Hãy chọn vai trò đăng nhập.")
    user = users[0]
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_email_verified:
        raise HTTPException(403, "Vui lòng xác nhận email trước khi đăng nhập")
    return {"access_token": create_token(user)}

@app.get("/api/auth/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(400, "Liên kết xác nhận không hợp lệ hoặc đã được sử dụng")
    user.is_email_verified = True
    user.email_verification_token = None
    db.commit()
    return {"message": "Email đã được xác nhận. Bạn có thể đăng nhập."}

@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user

def room_to_out(room: Room, favorite_ids: set[UUID] | None = None):
    room_fields = {
        name: getattr(room, name)
        for name in RoomOut.model_fields
        if name not in {"uploaded_images", "is_favorite", "favorite_id", "is_removed", "is_unavailable"}
    }
    data = RoomOut.model_validate(room_fields).model_dump()
    data["is_favorite"] = bool(favorite_ids and room.id in favorite_ids)
    data["uploaded_images"] = [f"/rooms/{room.id}/images/{image.id}" for image in room.uploaded_images]
    return data

def room_snapshot(room: Room) -> dict:
    return {
        "title": room.title,
        "source": room.source,
        "source_url": room.source_url if room.source == "nhatot" else None,
        "price": room.price,
        "area": room.area,
        "region": room.region,
        "district": room.district,
        "ward": room.ward,
        "street": room.street,
        "address": room.address,
        "images": list(room.images or []),
        "room_count": room.room_count,
    }

def preserve_room_favorites(db: Session, room: Room) -> None:
    favorites = db.query(Favorite).filter(Favorite.room_id == room.id).all()
    snapshot = room_snapshot(room)
    for favorite in favorites:
        favorite.room_snapshot_id = room.id
        favorite.snapshot = snapshot

def favorite_to_out(favorite: Favorite) -> dict:
    snapshot = favorite.snapshot or {}
    room = favorite.room
    if room:
        data = room_to_out(room, {room.id})
        data["favorite_id"] = favorite.id
        data["is_removed"] = False
        is_unavailable = room.source == "manual" and (
            room.available_count <= 0 or not room.available or room.status != RoomStatus.ACTIVE
        )
        data["is_unavailable"] = is_unavailable
        if is_unavailable:
            snapshot = room_snapshot(room)
            for field in ("title", "price", "area", "region", "district", "ward", "street", "address", "images", "room_count"):
                data[field] = snapshot[field]
            data.update({
                "description": "",
                "available": False,
                "available_count": 0,
                "phone": "",
                "seller_name": "",
                "amenities": [],
                "source_url": None,
                "uploaded_images": [],
            })
        return data

    source = snapshot.get("source") or "manual"
    snapshot_id = favorite.room_snapshot_id or favorite.id
    return {
        **snapshot,
        "id": snapshot_id,
        "source": source,
        "source_id": None,
        "landlord_id": None,
        "title": snapshot.get("title") or "Tin đã gỡ",
        "description": "",
        "price": snapshot.get("price") or 0,
        "room_count": snapshot.get("room_count") or 1,
        "available_count": 0,
        "area": snapshot.get("area"),
        "region": snapshot.get("region") or "",
        "district": snapshot.get("district") or "",
        "ward": snapshot.get("ward") or "",
        "street": snapshot.get("street") or "",
        "address": snapshot.get("address") or "",
        "lat": None,
        "lon": None,
        "images": snapshot.get("images") or [],
        "amenities": [],
        "phone": "",
        "seller_name": "",
        "status": RoomStatus.HIDDEN.value,
        "available": False,
        "created_at": favorite.created_at,
        "updated_at": favorite.created_at,
        "is_favorite": True,
        "uploaded_images": [],
        "favorite_id": favorite.id,
        "is_removed": True,
        "is_unavailable": False,
        "source_url": snapshot.get("source_url") if source == "nhatot" else None,
    }

@app.get("/api/geocode/search")
def search_address(q: str = Query(..., min_length=3, max_length=200)):
    import requests

    try:
        response = requests.get(
            "https://photon.komoot.io/api/",
            params={"q": q, "limit": 6, "countrycode": "VN", "lat": 21.0285, "lon": 105.8542},
            headers={"User-Agent": "PhongTroMap/1.0 (room address search)", "Accept-Language": "vi"},
            timeout=8,
        )
        response.raise_for_status()
        results = response.json().get("features", [])
    except requests.RequestException as exc:
        raise HTTPException(502, "Không tìm được địa chỉ lúc này. Vui lòng thử lại.") from exc
    suggestions = []
    for item in results:
        props = item.get("properties", {})
        coords = item.get("geometry", {}).get("coordinates", [])
        if len(coords) != 2:
            continue
        district = props.get("district") or props.get("county", "")
        ward = props.get("suburb") or props.get("locality", "")
        region = props.get("city") or props.get("state", "")
        label = ", ".join(dict.fromkeys(part for part in (
            props.get("name", ""), props.get("housenumber", ""), props.get("street", ""),
            ward, district, region, props.get("country", "Vietnam"),
        ) if part))
        suggestions.append({
            "label": label,
            "lat": float(coords[1]),
            "lon": float(coords[0]),
            "district": district,
            "ward": ward,
            "region": region,
        })
    return suggestions

@app.get("/api/rooms/{room_id}/images/{image_id}")
def room_image(room_id: UUID, image_id: UUID, db: Session = Depends(get_db)):
    image = db.query(RoomImage).filter(RoomImage.id == image_id, RoomImage.room_id == room_id).first()
    if not image:
        raise HTTPException(404, "Không tìm thấy ảnh")
    return Response(content=image.data, media_type=image.content_type, headers={"Cache-Control": "public, max-age=86400"})

@app.get("/api/rooms", response_model=RoomList)
def list_rooms(
    db: Session = Depends(get_db),
    user: User | None = Depends(optional_current_user),
    q: str = "",
    district: str = "",
    min_price: float | None = None,
    max_price: float | None = None,
    min_area: float | None = None,
    max_area: float | None = None,
    available: bool = True,
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: Literal["recent", "price-asc", "price-desc", "area-desc"] = "recent",
):
    query = db.query(Room).filter(Room.status == RoomStatus.ACTIVE)
    query = query.filter(Room.available_count > 0 if available else Room.available_count == 0)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Room.title.ilike(like), Room.address.ilike(like), Room.description.ilike(like), cast(Room.amenities, Text).ilike(like)))
    if district:
        query = query.filter(Room.district.ilike(f"%{district}%"))
    if min_price is not None: query = query.filter(Room.price >= min_price)
    if max_price is not None: query = query.filter(Room.price <= max_price)
    if min_area is not None: query = query.filter(Room.area >= min_area)
    if max_area is not None: query = query.filter(Room.area <= max_area)
    if min_lat is not None: query = query.filter(Room.lat >= min_lat)
    if max_lat is not None: query = query.filter(Room.lat <= max_lat)
    if min_lon is not None: query = query.filter(Room.lon >= min_lon)
    if max_lon is not None: query = query.filter(Room.lon <= max_lon)

    total = query.count()
    if sort_by == "price-asc":
        ordering = (Room.price.asc(), Room.updated_at.desc())
    elif sort_by == "price-desc":
        ordering = (Room.price.desc(), Room.updated_at.desc())
    elif sort_by == "area-desc":
        ordering = (Room.area.desc().nullslast(), Room.updated_at.desc())
    else:
        ordering = (Room.updated_at.desc(),)
    rooms = query.order_by(*ordering).offset(offset).limit(limit).all()

    favorite_ids = None
    if user and user.role == UserRole.USER:
        favorite_ids = {
            room_id for (room_id,) in db.query(Favorite.room_id).filter(
                Favorite.user_id == user.id,
                Favorite.room_id.isnot(None),
            ).all()
        }

    return {
        "items": [room_to_out(r, favorite_ids) for r in rooms],
        "total": total,
    }

@app.get("/api/rooms/{room_id}", response_model=RoomOut)
def get_room(room_id: UUID, db: Session = Depends(get_db), user: User | None = Depends(lambda: None)):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    return room_to_out(room)

@app.post("/api/rooms/{room_id}/favorite")
def toggle_favorite(room_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.USER))):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    fav = db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.room_id == room.id).first()
    if fav:
        db.delete(fav)
        db.commit()
        return {"saved": False}
    db.add(Favorite(
        user_id=user.id,
        room_id=room.id,
        room_snapshot_id=room.id,
        snapshot=room_snapshot(room),
    ))
    db.commit()
    return {"saved": True}

@app.get("/api/me/favorites", response_model=RoomList)
def favorites(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.USER))):
    saved = db.query(Favorite).filter(Favorite.user_id == user.id).order_by(Favorite.created_at.desc()).all()
    return {"items": [favorite_to_out(favorite) for favorite in saved], "total": len(saved)}

@app.delete("/api/me/favorites/{favorite_id}")
def remove_saved_favorite(favorite_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.USER))):
    favorite = db.query(Favorite).filter(Favorite.id == favorite_id, Favorite.user_id == user.id).first()
    if not favorite:
        raise HTTPException(404, "Saved room not found")
    db.delete(favorite)
    db.commit()
    return {"deleted": True}

def set_location(room: Room):
    from geoalchemy2.elements import WKTElement
    if room.lat is not None and room.lon is not None:
        room.location = WKTElement(f"POINT({room.lon} {room.lat})", srid=4326)

@app.get("/api/landlord/rooms", response_model=RoomList)
def landlord_rooms(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    rooms = db.query(Room).filter(Room.landlord_id == user.id).order_by(Room.updated_at.desc()).all()
    return {"items": [room_to_out(r) for r in rooms], "total": len(rooms)}

@app.get("/api/landlord/rooms/confirmation-needed", response_model=RoomList)
def landlord_rooms_needing_confirmation(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    setting = db.get(RoomRetentionSetting, 1)
    if not setting or not setting.days:
        return {"items": [], "total": 0}
    cutoff = datetime.utcnow() - timedelta(days=setting.days)
    rooms = db.query(Room).filter(
        Room.landlord_id == user.id,
        Room.source == "manual",
        Room.status == RoomStatus.ACTIVE,
        Room.available_count > 0,
        Room.created_at < cutoff,
    ).order_by(Room.created_at.asc()).all()
    return {"items": [room_to_out(room) for room in rooms], "total": len(rooms)}

@app.post("/api/landlord/rooms/{room_id}/confirm-availability", response_model=RoomOut)
def landlord_confirm_room_availability(
    room_id: UUID,
    payload: RoomAvailabilityConfirmation,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.LANDLORD)),
):
    room = db.get(Room, room_id)
    if not room or room.landlord_id != user.id or room.source != "manual":
        raise HTTPException(404, "Room not found")
    if payload.available:
        room.created_at = datetime.utcnow()
    else:
        room.available_count = 0
        room.available = False
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.post("/api/landlord/rooms", response_model=RoomOut)
def landlord_create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    data = payload.model_dump()
    if data["available_count"] is None:
        data["available_count"] = data["room_count"] if data["available"] else 0
    data["available_count"] = min(data["available_count"], data["room_count"])
    data["available"] = data["available_count"] > 0
    room = Room(**data, source="manual", landlord_id=user.id)
    set_location(room)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.post("/api/landlord/rooms/{room_id}/images", response_model=RoomOut)
async def landlord_upload_room_images(
    room_id: UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.LANDLORD)),
):
    room = db.get(Room, room_id)
    if not room or room.landlord_id != user.id:
        raise HTTPException(404, "Không tìm thấy phòng")
    if not files or len(files) > 8:
        raise HTTPException(400, "Mỗi lần tải lên từ 1 đến 8 ảnh")
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    for upload in files:
        if upload.content_type not in allowed_types:
            raise HTTPException(400, "Chỉ nhận ảnh JPG, PNG hoặc WebP")
        content = await upload.read(5 * 1024 * 1024 + 1)
        if not content or len(content) > 5 * 1024 * 1024:
            raise HTTPException(400, "Mỗi ảnh phải nhỏ hơn 5 MB")
        valid_signature = (
            upload.content_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
            or upload.content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
            or upload.content_type == "image/webp" and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        )
        if not valid_signature:
            raise HTTPException(400, "Định dạng nội dung ảnh không hợp lệ")
        db.add(RoomImage(room_id=room.id, content_type=upload.content_type, data=content))
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.put("/api/landlord/rooms/{room_id}", response_model=RoomOut)
def landlord_update_room(room_id: UUID, payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    room = db.get(Room, room_id)
    if not room or room.landlord_id != user.id:
        raise HTTPException(404, "Không tìm thấy phòng")
    data = payload.model_dump()
    for k, v in data.items():
        if k != "available_count" or v is not None:
            setattr(room, k, v)
    if data["available_count"] is None:
        room.available_count = room.room_count if data["available"] else 0
    room.available_count = min(room.room_count, max(0, room.available_count))
    room.available = room.available_count > 0
    set_location(room)
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.delete("/api/landlord/rooms/{room_id}")
def landlord_delete_room(room_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    room = db.get(Room, room_id)
    if not room or room.landlord_id != user.id:
        raise HTTPException(404, "Không tìm thấy phòng")
    preserve_room_favorites(db, room)
    db.delete(room)
    db.commit()
    return {"deleted": True}

@app.post("/api/admin/crawler/run")
def run_crawler(user: User = Depends(require_role(UserRole.ADMIN))):
    global crawler_state
    with crawler_state_lock:
        if crawler_state.get("status") in ("queued", "running"):
            return dict(crawler_state)
        crawler_state = {
            "status": "queued",
            "progress": 0,
            "processed": 0,
            "target": 10,
            "stage": "Đang chờ crawler tự động hoàn tất",
            "result": None,
            "error": None,
        }
    try:
        future = crawler_executor.submit(run_crawler_task)
        def release_if_not_started(done_future):
            if done_future.cancelled() or done_future.exception() is not None:
                update_crawler_state(status="failed", error="Không thể thực thi tác vụ crawler.")
        future.add_done_callback(release_if_not_started)
    except Exception as exc:
        update_crawler_state(status="failed", error=str(exc))
        raise HTTPException(500, f"Không khởi động được crawler: {exc}")
    return {"status": "queued", "progress": 0, "processed": 0, "target": 10}

@app.get("/api/admin/crawler/status")
def get_crawler_status(user: User = Depends(require_role(UserRole.ADMIN))):
    with crawler_state_lock:
        return dict(crawler_state)

@app.get("/api/admin/stats")
def admin_stats(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    return {
        "rooms": db.query(Room).count(),
        "active_rooms": db.query(Room).filter(Room.status == RoomStatus.ACTIVE).count(),
        "landlords": db.query(User).filter(User.role == UserRole.LANDLORD).count(),
        "users": db.query(User).filter(User.role == UserRole.USER).count(),
        "favorites": db.query(Favorite).count(),
        "nhatot_rooms": db.query(Room).filter(Room.source == "nhatot").count(),
    }

@app.get("/api/admin/accounts")
def admin_accounts(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
    role: Literal["user", "landlord"] = "user",
    q: str = "",
    active: bool | None = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    account_role = UserRole(role)
    query = db.query(User).filter(User.role == account_role)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.email.ilike(like), User.full_name.ilike(like), User.phone.ilike(like)))
    if active is not None:
        query = query.filter(User.is_active == active)

    total = query.count()
    accounts = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "items": [{
            "id": account.id,
            "email": account.email,
            "full_name": account.full_name,
            "phone": account.phone,
            "role": account.role.value,
            "is_active": account.is_active,
            "is_email_verified": account.is_email_verified,
            "created_at": account.created_at,
        } for account in accounts],
        "total": total,
    }

@app.put("/api/admin/accounts/{account_id}/active")
def admin_set_account_active(
    account_id: UUID,
    active: bool,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    account = db.get(User, account_id)
    if not account or account.role not in (UserRole.USER, UserRole.LANDLORD):
        raise HTTPException(404, "Account not found")
    account.is_active = active
    db.commit()
    return {"id": account.id, "is_active": account.is_active}

@app.get("/api/admin/room-retention")
def get_room_retention(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    setting = db.get(RoomRetentionSetting, 1)
    return {"days": setting.days if setting else None}

@app.put("/api/admin/room-retention")
def set_room_retention(payload: RoomRetentionUpdate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    if payload.days not in (None, 1, 3, 5, 7):
        raise HTTPException(422, "Retention must be 1, 3, 5, or 7 days")
    setting = db.get(RoomRetentionSetting, 1)
    if setting is None:
        setting = RoomRetentionSetting(id=1, days=payload.days)
        db.add(setting)
    else:
        setting.days = payload.days
    deleted = delete_expired_rooms(db, payload.days) if payload.days else 0
    db.commit()
    if payload.days:
        scheduler.add_job(scheduled_room_cleanup, "date", run_date=datetime.utcnow(), id="room-retention-immediate", replace_existing=True)
    return {"days": payload.days, "deleted": deleted}

@app.get("/api/admin/rooms", response_model=RoomList)
def admin_rooms(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
    q: str = "",
    posted_within_days: Literal[1, 3, 5, 7] | None = None,
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    query = db.query(Room)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            Room.title.ilike(like),
            Room.description.ilike(like),
            Room.address.ilike(like),
            Room.street.ilike(like),
            Room.district.ilike(like),
            Room.ward.ilike(like),
            Room.seller_name.ilike(like),
            Room.phone.ilike(like),
        ))
    if posted_within_days is not None:
        cutoff = datetime.utcnow() - timedelta(days=posted_within_days)
        query = query.filter(Room.created_at >= cutoff)
    total = query.count()
    rooms = query.order_by(Room.updated_at.desc()).offset(offset).limit(limit).all()
    return {"items": [room_to_out(r) for r in rooms], "total": total}


@app.post("/api/admin/rooms", response_model=RoomOut)
def admin_create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    data = payload.model_dump()
    if data["available_count"] is None:
        data["available_count"] = data["room_count"] if data["available"] else 0
    data["available_count"] = min(data["available_count"], data["room_count"])
    data["available"] = data["available_count"] > 0
    room = Room(**data, source="manual")
    set_location(room)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.post("/api/admin/rooms/{room_id}/images", response_model=RoomOut)
async def admin_upload_room_images(
    room_id: UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMIN)),
):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if not files or len(files) > 8:
        raise HTTPException(400, "Upload between 1 and 8 images")
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    for upload in files:
        if upload.content_type not in allowed_types:
            raise HTTPException(400, "Only JPG, PNG, and WebP images are accepted")
        content = await upload.read(5 * 1024 * 1024 + 1)
        if not content or len(content) > 5 * 1024 * 1024:
            raise HTTPException(400, "Each image must be smaller than 5 MB")
        valid_signature = (
            upload.content_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff")
            or upload.content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n")
            or upload.content_type == "image/webp" and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
        )
        if not valid_signature:
            raise HTTPException(400, "Image content does not match its file type")
        db.add(RoomImage(room_id=room.id, content_type=upload.content_type, data=content))
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.put("/api/admin/rooms/{room_id}", response_model=RoomOut)
def admin_update_room(room_id: UUID, payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    data = payload.model_dump()
    for k, v in data.items():
        if k != "available_count" or v is not None:
            setattr(room, k, v)
    if data["available_count"] is None:
        room.available_count = room.room_count if data["available"] else 0
    room.available_count = min(room.room_count, max(0, room.available_count))
    room.available = room.available_count > 0
    set_location(room)
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.delete("/api/admin/rooms/{room_id}")
def admin_delete_room(room_id: UUID, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    preserve_room_favorites(db, room)
    db.delete(room)
    db.commit()
    return {"deleted": True}

@app.put("/api/admin/rooms/{room_id}/status")
def admin_room_status(room_id: UUID, status: str, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(404, "Không tìm thấy phòng")
    try:
        room.status = RoomStatus(status.lower())
    except ValueError:
        raise HTTPException(400, "Status không hợp lệ")
    db.commit()
    return {"ok": True, "status": room.status.value}
