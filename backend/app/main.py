from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from uuid import UUID
import secrets

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db, SessionLocal, ensure_email_verification_columns, ensure_room_count_column, ensure_available_count_column, ensure_room_street_length
from .models import User, UserRole, Room, RoomStatus, RoomImage, Favorite
from .schemas import Token, RegisterIn, LoginIn, UserOut, RoomCreate, RoomOut, RoomList, RegisterResult
from .auth import hash_password, verify_password, create_token, current_user, require_role
from .crawler_service import crawl_once
from .email_service import send_verification_email

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
    db = SessionLocal()
    try:
        result = crawl_once(db, max_records=3, progress_callback=update_crawler_state, geocode_missing=False, only_new=True)
        update_crawler_state(status="completed", progress=100, stage="Hoàn tất", result=result, error=None)
    except Exception as exc:
        db.rollback()
        update_crawler_state(status="failed", result=None, error=str(exc))
        print("Crawler error:", exc)
    finally:
        db.close()
        crawler_lock.release()

def scheduled_crawl():
    db = SessionLocal()
    try:
        crawl_once(db, max_records=200)
    except Exception as exc:
        print("Crawler error:", exc)
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_email_verification_columns()
    ensure_room_count_column()
    ensure_available_count_column()
    ensure_room_street_length()
    if settings.crawler_enabled:
        scheduler.add_job(scheduled_crawl, "interval", minutes=settings.crawler_interval_minutes, id="nhatot-sync", replace_existing=True)
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
        if name not in {"uploaded_images", "is_favorite"}
    }
    data = RoomOut.model_validate(room_fields).model_dump()
    data["is_favorite"] = bool(favorite_ids and room.id in favorite_ids)
    data["uploaded_images"] = [f"/rooms/{room.id}/images/{image.id}" for image in room.uploaded_images]
    return data

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
):
    query = db.query(Room).filter(Room.status == RoomStatus.ACTIVE)
    query = query.filter(Room.available_count > 0 if available else Room.available_count == 0)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Room.title.ilike(like), Room.address.ilike(like), Room.description.ilike(like)))
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
    rooms = query.order_by(Room.updated_at.desc()).offset(offset).limit(limit).all()

    return {
        "items": [room_to_out(r) for r in rooms],
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
    db.add(Favorite(user_id=user.id, room_id=room.id))
    db.commit()
    return {"saved": True}

@app.get("/api/me/favorites", response_model=RoomList)
def favorites(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.USER))):
    rooms = db.query(Room).join(Favorite, Favorite.room_id == Room.id).filter(Favorite.user_id == user.id).order_by(Favorite.created_at.desc()).all()
    return {"items": [room_to_out(r, {r.id}) for r in rooms], "total": len(rooms)}

def set_location(room: Room):
    from geoalchemy2.elements import WKTElement
    if room.lat is not None and room.lon is not None:
        room.location = WKTElement(f"POINT({room.lon} {room.lat})", srid=4326)

@app.get("/api/landlord/rooms", response_model=RoomList)
def landlord_rooms(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    rooms = db.query(Room).filter(Room.landlord_id == user.id).order_by(Room.updated_at.desc()).all()
    return {"items": [room_to_out(r) for r in rooms], "total": len(rooms)}

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
    db.delete(room)
    db.commit()
    return {"deleted": True}

@app.post("/api/admin/crawler/run")
def run_crawler(user: User = Depends(require_role(UserRole.ADMIN))):
    global crawler_state
    if not crawler_lock.acquire(blocking=False):
        with crawler_state_lock:
            return {**crawler_state, "message": "Crawler đang chạy."}
    update_crawler_state(status="running", progress=0, processed=0, target=3, stage="Đang kết nối Nhà Tốt", result=None, error=None)
    try:
        future = crawler_executor.submit(run_crawler_task)
        def release_if_not_started(done_future):
            if done_future.cancelled() or done_future.exception() is not None:
                update_crawler_state(status="failed", error="Không thể thực thi tác vụ crawler.")
                if crawler_lock.locked():
                    crawler_lock.release()
        future.add_done_callback(release_if_not_started)
    except Exception as exc:
        update_crawler_state(status="failed", error=str(exc))
        crawler_lock.release()
        raise HTTPException(500, f"Không khởi động được crawler: {exc}")
    return {"status": "started", "progress": 0, "processed": 0, "target": 3}

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

@app.get("/api/admin/rooms", response_model=RoomList)
def admin_rooms(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.ADMIN))):
    rooms = db.query(Room).order_by(Room.updated_at.desc()).limit(500).all()
    return {"items": [room_to_out(r) for r in rooms], "total": len(rooms)}


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
