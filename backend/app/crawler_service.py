import json
import re
import random
import time
import requests
import unicodedata
from sqlalchemy.orm import Session
from geoalchemy2.elements import WKTElement

from .models import Room, RoomStatus

BASE_URL = "https://gateway.chotot.com/v1/public/ad-listing"
DETAIL_URL = "https://gateway.chotot.com/v1/public/ad-detail/{}"
REGION_ID = 12000
CATEGORY_ID = 1050
TYPE = "u"
LIMIT = 20

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    "Referer": "https://www.nhatot.com/",
    "Origin": "https://www.nhatot.com",
})

ROOM_KEYWORDS = ["phòng trọ", "phong tro", "phòng cho thuê", "cho thuê phòng", "trọ", "tro", "ccmn", "căn hộ mini", "studio", "homestay", "ở ghép", "ký túc xá", "ktx", "sleepbox"]
NON_ROOM_KEYWORDS = ["cho thuê nhà nguyên căn", "cho thuê mặt bằng", "cho thuê kho", "cho thuê văn phòng", "cho thuê cửa hàng", "cho thuê đất"]

def get_json(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            r = session.get(url, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
            else:
                time.sleep(1 + attempt)
        except requests.RequestException:
            time.sleep(2 * (attempt + 1))
    return None

def object_to_text(v):
    if v is None: return ""
    if isinstance(v, str): return v
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return " ".join(object_to_text(x) for x in v)
    if isinstance(v, dict): return " ".join(object_to_text(k) + " " + object_to_text(x) for k, x in v.items())
    return str(v)

def get_list_id(ad):
    return str(ad.get("list_id") or ad.get("listId") or ad.get("listing_id") or ad.get("listingId") or "").strip()

def get_ad_id(ad):
    return str(ad.get("ad_id") or ad.get("adId") or "").strip()

def is_room(ad):
    if str(ad.get("category", "")).strip() == str(CATEGORY_ID):
        return True
    if str(ad.get("category_name", "")).lower().strip() == "phòng trọ":
        return True
    text = object_to_text([ad.get("subject", ""), ad.get("body", ""), ad.get("category_name", ""), ad.get("canonical_category_key", "")]).lower()
    if any(k in text for k in NON_ROOM_KEYWORDS):
        return False
    return any(k in text for k in ROOM_KEYWORDS)

def extract_images(ad):
    out = []
    for key in ["images", "image_thumbnails"]:
        value = ad.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    url = item
                elif isinstance(item, dict):
                    url = next((item.get(k) for k in ["image", "url", "image_url", "full", "original", "thumbnail"] if item.get(k)), "")
                else:
                    url = ""
                if url and url not in out:
                    out.append(url)
    for key in ["image", "thumbnail_image", "webp_image"]:
        if isinstance(ad.get(key), str) and ad[key] not in out:
            out.append(ad[key])
    return out

def extract_coords(ad):
    # Ưu tiên tọa độ có sẵn từ dữ liệu nguồn.
    lat_keys = ["latitude", "lat", "location_lat", "locationLatitude"]
    lon_keys = ["longitude", "lon", "lng", "location_lon", "locationLongitude"]
    lat = next((ad.get(k) for k in lat_keys if ad.get(k) is not None), None)
    lon = next((ad.get(k) for k in lon_keys if ad.get(k) is not None), None)
    try:
        return float(lat), float(lon)
    except (TypeError, ValueError):
        return None, None

def address(ad):
    parts = []
    for k in ["street_number", "street_name", "ward_name", "area_name", "region_name"]:
        v = ad.get(k)
        if v and str(v).strip() not in parts:
            parts.append(str(v).strip())
    return ", ".join(parts)

def source_url(ad):
    for k in ["url", "web_url", "webUrl", "listing_url", "listingUrl", "canonical_url", "canonicalUrl", "share_url", "shareUrl"]:
        v = ad.get(k)
        if isinstance(v, str) and "nhatot.com" in v:
            return v
    lid = get_list_id(ad)
    if not lid:
        return ""
    region = str(ad.get("region_name") or ad.get("region_name_v3") or "").lower()
    district = str(ad.get("area_name") or ad.get("district_name") or ad.get("district") or "")
    def slug(s):
        s = unicodedata.normalize("NFD", s.lower())
        s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
        return re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    rs, ds = slug(region), slug(district)
    if "ha-noi" in rs or "hanoi" in rs:
        loc = f"quan-{ds}-ha-noi" if ds else "ha-noi"
    elif "ho-chi-minh" in rs:
        loc = f"quan-{ds}-ho-chi-minh" if ds else "ho-chi-minh"
    else:
        loc = ds or rs
    return f"https://www.nhatot.com/thue-phong-tro-{loc}/{lid}.htm"

def find_detail_obj(data):
    if not isinstance(data, dict): return None
    for obj in [data.get("ad"), data.get("data"), data.get("result")]:
        if isinstance(obj, dict):
            if isinstance(obj.get("ad"), dict): return obj["ad"]
            if any(k in obj for k in ["ad_id", "list_id", "subject"]): return obj
    return data if any(k in data for k in ["ad_id", "list_id", "subject"]) else None

def geocode_address(text):
    # Fallback cho tin không có lat/lon. Có cache ở phía database bằng cách lưu kết quả.
    # Nominatim yêu cầu User-Agent nhận diện ứng dụng; không nên dùng để geocode hàng loạt quá nhanh.
    if not text:
        return None, None
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": text, "format": "jsonv2", "limit": 1, "countrycodes": "vn"},
            headers={"User-Agent": "PhongTroStudentProject/1.0"},
            timeout=15,
        )
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return None, None

def crawl_once(db: Session, max_records: int = 100) -> dict:
    offset = 0
    seen = {}
    total = 0

    while len(seen) < max_records:
        data = get_json(BASE_URL, {
            "region_v2": REGION_ID, "cg": CATEGORY_ID, "w": 1,
            "limit": LIMIT, "o": offset, "st": TYPE
        })
        if not isinstance(data, dict):
            break

        total = data.get("total", 0) or total
        page_ads = (data.get("ads") or []) + (data.get("sticky_ads") or []) + (data.get("gallery_ads") or [])
        if not page_ads:
            break

        for ad in page_ads:
            if not isinstance(ad, dict) or not is_room(ad):
                continue
            lid = get_list_id(ad)
            if lid:
                seen[lid] = ad
            if len(seen) >= max_records:
                break

        if total and offset + LIMIT >= total:
            break
        offset += LIMIT
        time.sleep(random.uniform(0.7, 1.5))

    created = updated = 0
    for lid, ad in seen.items():
        aid = get_ad_id(ad)
        detail = get_json(DETAIL_URL.format(aid), retries=2) if aid else None
        detail_ad = find_detail_obj(detail)
        if isinstance(detail_ad, dict):
            ad = {**ad, **{k: v for k, v in detail_ad.items() if v is not None}}

        region = str(ad.get("region_name") or ad.get("region_name_v3") or "Hà Nội")
        district = str(ad.get("area_name") or ad.get("district_name") or "")
        ward = str(ad.get("ward_name") or ad.get("ward_name_v3") or "")
        street = str(ad.get("street_name") or "")
        addr = address(ad)
        lat, lon = extract_coords(ad)

        # Không tự ý coi địa chỉ text là tọa độ chính xác.
        if lat is None or lon is None:
            lat, lon = geocode_address(addr + ", Hà Nội")

        room = db.query(Room).filter(Room.source == "nhatot", Room.source_id == lid).first()
        if not room:
            room = Room(source="nhatot", source_id=lid)
            db.add(room)
            created += 1
        else:
            updated += 1

        room.title = str(ad.get("subject") or "Phòng trọ")
        room.description = str(ad.get("body") or "")
        room.price = float(ad.get("price") or 0)
        try:
            room.area = float(ad.get("size") or ad.get("size_m2") or 0) or None
        except (TypeError, ValueError):
            room.area = None
        room.region, room.district, room.ward, room.street, room.address = region, district, ward, street, addr
        room.lat, room.lon = lat, lon
        room.location = WKTElement(f"POINT({lon} {lat})", srid=4326) if lat is not None and lon is not None else None
        room.images = extract_images(ad)
        room.source_url = source_url(ad)
        room.phone = str(ad.get("phone") or ad.get("seller_phone") or "")
        room.seller_name = str(ad.get("account_name") or ad.get("seller_name") or ad.get("full_name") or "")
        room.status = RoomStatus.ACTIVE
        room.available = True

    db.commit()
    return {"fetched": len(seen), "created": created, "updated": updated, "api_total": total}
