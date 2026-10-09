# Phòng Trọ Map

Ứng dụng tìm kiếm và quản lý phòng trọ trên bản đồ. Dự án gồm giao diện Next.js, API FastAPI, PostgreSQL/PostGIS và crawler tin đăng.

## Chức năng

- Tìm phòng trên bản đồ OpenStreetMap và xem danh sách tin.
- Lọc theo từ khóa, quận/huyện, khoảng giá và diện tích; sắp xếp theo giá, diện tích hoặc thời gian cập nhật.
- Xem chi tiết, ảnh phóng to, tiện ích, vị trí và thông tin liên hệ; lưu tin yêu thích.
- Đăng ký tài khoản khách hoặc chủ trọ, xác minh email và đăng nhập theo vai trò.
- Chủ trọ đăng, sửa, xóa tin; quản lý số phòng còn trống riêng cho từng tin.
- Quản trị viên xem thống kê, quản lý tin và chạy crawler.
- Ảnh tải lên được lưu trong cơ sở dữ liệu.

## Công nghệ

- Frontend: Next.js, React, TypeScript, Tailwind CSS, Leaflet.
- Backend: FastAPI, SQLAlchemy, GeoAlchemy.
- Cơ sở dữ liệu: PostgreSQL với PostGIS.
- Email xác minh: Brevo API hoặc SMTP.
- Triển khai phát triển: Docker Compose.

## Chạy bằng Docker

Cần cài Docker Desktop và bật Docker Engine. Từ thư mục chứa file `docker-compose.yml`:

```bash
cp .env.example .env
```

Trên PowerShell có thể dùng:

```powershell
Copy-Item .env.example .env
```

Điền thông tin gửi email trong `.env` nếu cần xác minh email, sau đó chạy:

```bash
docker compose up --build -d
```

Các địa chỉ sau được mở trên máy cục bộ:

- Ứng dụng: http://localhost:3000
- Tài liệu API: http://localhost:8000/docs
- Kiểm tra API: http://localhost:8000/api/health
- PostgreSQL: `localhost:5432` (cơ sở dữ liệu phát triển `phongtro`).

Tắt dịch vụ:

```bash
docker compose down
```

Dữ liệu PostgreSQL được lưu trong Docker volume `phongtro-map_pgdata`.

## Cấu hình email

Docker Compose đọc các giá trị email từ file `.env` ở thư mục gốc dự án. Dùng Brevo API:

```dotenv
BREVO_API_KEY=your-brevo-api-key
SMTP_FROM_EMAIL=email_đã_xác_minh@example.com
SMTP_FROM_NAME=Phong Tro Map
```

Hoặc cấu hình SMTP bằng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` và `SMTP_USE_TLS`. Không đưa khóa API, mật khẩu SMTP hoặc file `.env` lên Git.

## Tạo tài khoản quản trị

Đăng ký tài khoản chủ trọ, sau đó quản trị viên cơ sở dữ liệu có thể cấp quyền quản trị cho đúng email trong môi trường phát triển:

```sql
UPDATE users
SET role = 'admin'
WHERE email = 'admin@example.com' AND role = 'landlord';
```

## Cấu trúc thư mục

```text
backend/       FastAPI, mô hình dữ liệu, crawler và migration khởi động
frontend/      Ứng dụng Next.js
docker-compose.yml
```

## Chạy riêng frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định gọi API tại `http://localhost:8000/api`. Có thể thay địa chỉ bằng biến `NEXT_PUBLIC_API_URL` trong `frontend/.env.local`.

## Crawler

Crawler lấy tin phòng trọ từ nguồn Nhà Tốt, lưu hoặc cập nhật tin trong PostgreSQL và có thể chạy theo lịch hoặc từ trang quản trị. Tọa độ địa chỉ được dùng khi nguồn cung cấp; nếu cần geocode bổ sung, kết quả địa chỉ chỉ là vị trí ước lượng.
