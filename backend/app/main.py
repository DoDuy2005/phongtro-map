from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from uuid import UUID

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db, SessionLocal
from .models import User, UserRole, Room, RoomStatus, Favorite
from .schemas import Token, RegisterIn, LoginIn, UserOut, RoomCreate, RoomOut, RoomList
from .auth import hash_password, verify_password, create_token, current_user, require_role
from .crawler_service import crawl_once

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
        update_crawler_state(status="completed", progress=100, stage="Ho\u00e0n t\u1ea5t", result=result, error=None)
    except Exception as exc:
        db.rollback()
        update_crawler_state(status="failed", result=None, error=str(exc))
        print("Crawler error:", exc)
    finally:
        db.close()
        crawler_lock.release()

DEMO_ADMIN_EMAIL = "admin@phongtromap.local"
DEMO_ADMIN_PASSWORD = "Admin@123"
DEMO_LANDLORD_EMAIL = "chutro@phongtromap.local"
DEMO_LANDLORD_PASSWORD = "Chutro@123"
DEMO_USER_EMAIL = "user@phongtromap.local"
DEMO_USER_PASSWORD = "User@123"

def seed_demo_data(db: Session):
    # Tạo tài khoản demo và vài phòng mẫu để project chạy lên là có dữ liệu.
    accounts = [
        (DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, "Quản trị viên", "0900000001", UserRole.ADMIN),
        (DEMO_LANDLORD_EMAIL, DEMO_LANDLORD_PASSWORD, "Chủ trọ Demo", "0900000002", UserRole.LANDLORD),
        (DEMO_USER_EMAIL, DEMO_USER_PASSWORD, "Người dùng Demo", "0900000003", UserRole.USER),
    ]
    users = {}
    for email, password, name, phone, role in accounts:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, password_hash=hash_password(password), full_name=name, phone=phone, role=role)
            db.add(user)
            db.flush()
        else:
            user.role = role
            user.is_active = True
        users[role.value] = user

    samples = [
        ("Phòng trọ demo Cầu Giấy - gần ĐHQG", 2800000, 22, "Cầu Giấy", "Dịch Vọng", "Ngõ 165 Cầu Giấy", 21.0367, 105.7902),
        ("Phòng trọ demo Thanh Xuân - full nội thất", 3200000, 25, "Thanh Xuân", "Nhân Chính", "Ngõ 116 Nhân Hòa", 20.9988, 105.8080),
        ("Phòng trọ demo Đống Đa - giá sinh viên", 2400000, 18, "Đống Đa", "Láng Hạ", "Ngõ 121 Láng Hạ", 21.0125, 105.8155),
        ("Phòng trọ demo Hai Bà Trưng - có điều hòa", 3500000, 27, "Hai Bà Trưng", "Bách Khoa", "Ngõ Tạ Quang Bửu", 21.0015, 105.8448),
        ("Phòng trọ demo Bắc Từ Liêm - có gác", 2600000, 20, "Bắc Từ Liêm", "Phú Diễn", "Đường Phú Diễn", 21.0379, 105.7520),
    ]
    landlord = users[UserRole.LANDLORD.value]
    for title, price, area, district, ward, address, lat, lon in samples:
        exists = db.query(Room).filter(Room.source == "demo", Room.title == title).first()
        if exists:
            continue
        room = Room(source="demo", source_id=title.lower().replace(" ", "-")[:90], title=title,
                    description="Dữ liệu phòng mẫu để kiểm tra giao diện. Có thể xóa hoặc thay bằng dữ liệu crawler Nhà Tốt.",
                    price=price, area=area, region="Hà Nội", district=district, ward=ward,
                    address=address, lat=lat, lon=lon,
                    images=[], amenities=["Wifi", "Điều hòa", "Nóng lạnh"],
                    phone="0900000002", seller_name="Chủ trọ Demo",
                    status=RoomStatus.ACTIVE, available=True, landlord_id=landlord.id)
        set_location(room)
        db.add(room)
    db.commit()

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
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()
    if settings.crawler_enabled:
        scheduler.add_job(scheduled_crawl, "interval", minutes=settings.crawler_interval_minutes, id="nhatot-sync", replace_existing=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)

def set_location(room: Room):
    from geoalchemy2.elements import WKTElement
    if room.lat is not None and room.lon is not None:
        room.location = WKTElement(f"POINT({room.lon} {room.lat})", srid=4326)

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

@app.post("/api/auth/register", response_model=Token)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(400, "Email đã tồn tại")
    role = UserRole.LANDLORD if payload.role == "landlord" else UserRole.USER
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_token(user)}

@app.post("/api/auth/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email hoặc mật khẩu không đúng")
    return {"access_token": create_token(user)}

@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user

def room_to_out(room: Room, favorite_ids: set[UUID] | None = None):
    data = RoomOut.model_validate(room).model_dump()
    data["is_favorite"] = bool(favorite_ids and room.id in favorite_ids)
    return data

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
    query = db.query(Room).filter(Room.status == RoomStatus.ACTIVE, Room.available == available)
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

@app.get("/api/landlord/rooms", response_model=RoomList)
def landlord_rooms(db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    rooms = db.query(Room).filter(Room.landlord_id == user.id).order_by(Room.updated_at.desc()).all()
    return {"items": [room_to_out(r) for r in rooms], "total": len(rooms)}

@app.post("/api/landlord/rooms", response_model=RoomOut)
def landlord_create_room(payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    room = Room(**payload.model_dump(), source="manual", landlord_id=user.id)
    set_location(room)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room_to_out(room)

@app.put("/api/landlord/rooms/{room_id}", response_model=RoomOut)
def landlord_update_room(room_id: UUID, payload: RoomCreate, db: Session = Depends(get_db), user: User = Depends(require_role(UserRole.LANDLORD))):
    room = db.get(Room, room_id)
    if not room or room.landlord_id != user.id:
        raise HTTPException(404, "Không tìm thấy phòng")
    for k, v in payload.model_dump().items():
        setattr(room, k, v)
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
    if not crawler_lock.acquire(blocking=False):
        with crawler_state_lock:
            return {**crawler_state, "message": "Crawler \u0111ang ch\u1ea1y."}
    update_crawler_state(status="running", progress=0, processed=0, target=3, stage="\u0110ang k\u1ebft n\u1ed1i Nh\u00e0 T\u1ed1t", result=None, error=None)
    try:
        future = crawler_executor.submit(run_crawler_task)
        def release_if_not_started(done_future):
            if done_future.cancelled() or done_future.exception() is not None:
                update_crawler_state(status="failed", error="Kh\u00f4ng th\u1ec3 th\u1ef1c thi t\u00e1c v\u1ee5 crawler.")
                if crawler_lock.locked():
                    crawler_lock.release()
        future.add_done_callback(release_if_not_started)
    except Exception as exc:
        update_crawler_state(status="failed", error=str(exc))
        crawler_lock.release()
        raise HTTPException(500, f"Kh\u00f4ng kh\u1edfi \u0111\u1ed9ng \u0111\u01b0\u1ee3c crawler: {exc}")
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
    room = Room(**payload.model_dump(), source="manual")
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
    for k, v in payload.model_dump().items():
        setattr(room, k, v)
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
