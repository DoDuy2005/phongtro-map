# Phòng Trọ Map

Hệ thống tìm kiếm và quản lý phòng trọ trên bản đồ.

## Công nghệ

- Next.js
- TypeScript
- Tailwind CSS
- FastAPI
- Python
- PostgreSQL
- PostGIS
- Leaflet
- OpenStreetMap
- Docker
- Docker Compose
- Pytest
- Playwright

## Chức năng

- Tìm kiếm phòng trọ
- Lọc phòng
- Hiển thị phòng trên bản đồ
- Lưu phòng yêu thích
- Quản lý chủ trọ
- Quản trị viên
- Crawler dữ liệu
- Tự động cập nhật dữ liệu
- 
## 1. Luồng người dùng

Trang `/`:
- "Tôi đang tìm phòng" -> `/rooms`
- "Tôi là chủ trọ" -> `/landlord/login`

Người dùng:
- bản đồ + marker giá
- danh sách phòng
- tìm kiếm
- lọc quận/huyện, giá
- click marker -> chi tiết
- link về Nhà Tốt
- lưu phòng
- phòng đã lưu được marker viền vàng
- nếu chưa đăng nhập khi lưu -> yêu cầu đăng nhập

Chủ trọ:
- đăng ký/đăng nhập
- thêm phòng
- sửa phòng
- xóa phòng
- cập nhật "còn phòng/đã cho thuê"
- nhập lat/lon để pin chính xác

Admin:
- thống kê
- xem danh sách tin
- thêm phòng thủ công
- sửa phòng
- xóa phòng
- ẩn/duyệt/từ chối
- chạy crawler thủ công
- crawler tự chạy theo APScheduler

## 2. Chạy

```bash
docker compose up --build
```

Frontend: http://localhost:3000  
Backend docs: http://localhost:8000/docs

## 3. Tài khoản demo

Backend tự tạo dữ liệu demo khi khởi động lần đầu:

| Vai trò | Email | Mật khẩu | Trang |
|---|---|---|---|
| Admin | `admin@phongtromap.local` | `Admin@123` | `/admin/login` |
| Chủ trọ | `chutro@phongtromap.local` | `Chutro@123` | `/landlord/login` |
| Người dùng | `user@phongtromap.local` | `User@123` | `/rooms/login` |

Có sẵn 5 phòng mẫu quanh Hà Nội để kiểm tra bản đồ trước khi chạy crawler.

> Nếu bạn đã có volume PostgreSQL cũ, dữ liệu demo vẫn được kiểm tra theo email/tên phòng và không tạo trùng.

## 4. Crawler

Crawler đã được tách từ logic code Nhà Tốt hiện có:
- `gateway.chotot.com/v1/public/ad-listing`
- `gateway.chotot.com/v1/public/ad-detail/{ad_id}`
- Hà Nội `region_v2=12000`
- phòng trọ `cg=1050`
- dùng `list_id` làm mã nguồn để chống trùng.

Crawler còn bổ sung:
- upsert tin vào PostgreSQL
- lưu ảnh
- lưu URL Nhà Tốt
- cố gắng lấy lat/lon từ dữ liệu nguồn
- nếu không có tọa độ thì fallback geocode địa chỉ; không nên coi geocode fallback là tọa độ tuyệt đối chính xác.


## 5. Lưu ý database

Không cần cài SQL Server/PostgreSQL trực tiếp trên Windows nếu chạy bằng Docker Compose. Service `db` chính là PostgreSQL + PostGIS và được map ra cổng `5432`. Nếu chưa chạy Docker Compose thì frontend có thể mở được nhưng API/database sẽ không có dữ liệu. Crawler không chạy ngay lập tức; lịch mặc định là mỗi 60 phút. Có thể vào Admin và bấm **Chạy crawler Nhà Tốt** để đồng bộ ngay.
