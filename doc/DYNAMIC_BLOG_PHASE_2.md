# Blog động một tác giả — hướng dẫn giai đoạn 2

**Trạng thái:** Mã nguồn trên nhánh `feature/dynamic-blog-api`, chưa merge vào `main`, chưa triển khai EC2.

## Chức năng

- Khách truy cập: xem bài đã xuất bản, không cần đăng nhập.
- Chủ blog: truy cập `/admin`, đăng nhập bằng tài khoản quản trị, tạo/sửa/xóa bài, lưu bản nháp hoặc xuất bản.
- Chỉ có **một** tài khoản admin cấu hình qua biến môi trường; không có đăng ký người dùng.
- Bài nháp không xuất hiện trong API công khai.
- Nội dung hiện được hiển thị như văn bản thuần; chưa hỗ trợ render Markdown, upload ảnh hoặc tìm kiếm toàn văn.

## Khởi chạy API để thử nghiệm trên máy cá nhân

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export BLOG_ADMIN_USER=admin
export BLOG_ADMIN_PASSWORD='THAY_BANG_MAT_KHAU_DAI_NGAU_NHIEN'
export BLOG_DB_PATH=./data/blog.db
uvicorn app:app --host 127.0.0.1 --port 8000
```

Trên Windows PowerShell, dùng `$env:BLOG_ADMIN_USER="admin"` và `$env:BLOG_ADMIN_PASSWORD="..."` thay cho `export`.

Thử API:

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/posts
curl -u admin:'THAY_BANG_MAT_KHAU_DAI_NGAU_NHIEN' http://127.0.0.1:8000/api/admin/me
```

Frontend React gọi các URL `/api/...` cùng origin. Để thử UI qua Vite, cần cấu hình Vite proxy cho `/api` về `http://127.0.0.1:8000`; để triển khai trên EC2, cần cấu hình Nginx host chuyển `/api/` tới backend riêng (ví dụ `127.0.0.1:8001`).

## API

| Method | Endpoint | Quyền |
| --- | --- | --- |
| GET | `/api/health` | Public |
| GET | `/api/posts` | Public |
| GET | `/api/posts/{slug}` | Public |
| GET | `/api/admin/me` | Admin |
| GET | `/api/admin/posts` | Admin |
| POST | `/api/admin/posts` | Admin |
| PUT | `/api/admin/posts/{id}` | Admin |
| DELETE | `/api/admin/posts/{id}` | Admin |

Admin sử dụng HTTP Basic với biến môi trường `BLOG_ADMIN_USER` và `BLOG_ADMIN_PASSWORD`; trình duyệt chỉ giữ credential trong React state, không ghi localStorage. Đây là cơ chế đơn giản cho một người dùng, **chỉ dùng qua HTTPS**, và cần bảo vệ thêm bằng rate limit ở reverse proxy trước khi public. Không commit password vào Git hoặc Docker image.

## Chuẩn bị trước khi đưa lên production

1. Cấu hình `/api/` reverse proxy trên Nginx host; backend chỉ bind loopback, không mở port Internet.
2. Tạo thư mục dữ liệu lâu dài trên EBS, mount vào container tại `/data`, phân quyền cho UID 10001.
3. Tạo mật khẩu admin dài, ngẫu nhiên, lưu trong file environment trên EC2 với quyền `chmod 600` (không commit).
4. Giới hạn tốc độ truy cập `/api/admin/` bằng Nginx; cân nhắc IP allowlist hoặc Cloudflare Access để bảo vệ trang quản trị.
5. Thêm kiểm thử tự động cho đăng nhập, phân quyền, CRUD và lọc bài nháp; hiện tại chưa chạy test.
6. Tạo backup nhất quán cho SQLite, đưa bản backup ra khỏi EC2 (ví dụ S3), và kiểm tra restore.
7. Cập nhật workflow CI/CD để build/deploy backend **riêng**; workflow EC2 hiện tại chỉ build Dockerfile frontend ở root. Không merge/deploy trước khi hoàn thành bước này.

## Ghi chú bảo mật và giới hạn

- Không có API đăng ký người dùng; mọi API ghi dữ liệu yêu cầu admin.
- Dữ liệu đầu vào được giới hạn độ dài và slug được kiểm tra định dạng.
- Trạng thái `draft` không thể truy cập qua API public.
- Giao diện public vẫn hiển thị bài demo nếu API chưa khả dụng; khi API khả dụng và trả danh sách trống, hiển thị thông báo chưa có bài.
- HTTP Basic không cung cấp khóa tài khoản, MFA hay cơ chế session revoke. Có thể nâng cấp về sau.
- Bài viết hiện lưu dưới dạng plain text/Markdown source, chưa chuyển Markdown thành HTML để tránh rủi ro XSS.
