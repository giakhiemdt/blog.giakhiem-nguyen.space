# Nhật ký triển khai blog động trên AWS EC2 + S3

> **Phạm vi:** Ghi lại các bước đã thực hiện ngày 04/11/2026 và giải thích từng câu lệnh.  
> **Dự án:** `giakhiemdt/blog.giakhiem-nguyen.space`  
> **Nhánh mã nguồn triển khai thử:** `feature/dynamic-blog-api`  
> **Website:** `https://blog.giakhiem-nguyen.space`  
> **AWS Region:** Asia Pacific (Sydney), `ap-southeast-2`  
> **S3 bucket:** `giakhiem-blog-media-2026`

## 1. Mục tiêu và kiến trúc

Blog cho phép mọi người **xem bài viết công khai**, chỉ chủ blog được **đăng nhập quản trị, tạo/sửa/xóa bài và upload ảnh**. Ưu tiên chi phí thấp và tận dụng EC2 sẵn có, không cần RDS/Lambda cho MVP.

```text
Trình duyệt
    |
    | HTTPS
    v
Cloudflare
    |
    v
Nginx trên EC2 (SSL/Certbot)
    |-- /, /admin ------> 127.0.0.1:8080 --> Docker 'blog'
    |                                           React + Vite + Nginx
    |
    |-- /api/* --------> 127.0.0.1:8001 --> Docker 'blog-api'
                                                FastAPI
                                                |-- SQLite trên EBS:
                                                |   /opt/giakhiem-blog/data
                                                |
                                                '-- IAM Role -> S3 private bucket
                                                    images/<uuid>.jpg|png|webp|gif
```

**Lưu ý:** Cổng `8081` được dùng để thử frontend mới (`blog-candidate`) trước khi chuyển production; `8002` chỉ được dùng nếu chạy script backend candidate trong repo. Các container chỉ bind `127.0.0.1`, không mở trực tiếp ra Internet.

### Thành phần

| Thành phần | Vai trò | Nơi chạy/lưu |
|---|---|---|
| React + Vite | Giao diện đọc bài và `/admin` | Docker `blog`, cổng `8080` |
| FastAPI | API bài viết, đăng nhập HTTP Basic, upload ảnh | Docker `blog-api`, cổng `8001` |
| SQLite | Lưu tiêu đề, nội dung, slug, trạng thái, URL ảnh | EBS qua volume `/opt/giakhiem-blog/data:/data` |
| Amazon S3 | Lưu file ảnh thực tế, bucket không public | `giakhiem-blog-media-2026` |
| IAM Role | Cấp quyền S3 tạm thời cho EC2 | AWS IAM / EC2 instance profile |
| Nginx host | HTTPS reverse proxy cho web và API | Hệ điều hành EC2 |
| Cloudflare | DNS/proxy ở phía trước | Cloudflare |
| GitHub Actions | Deploy frontend từ `main` | Chưa đồng bộ triển khai backend |

**Đã xác nhận trong quá trình thực hiện:** `/api/health` trả HTTP 200, upload `/api/admin/images` trả HTTP 201, frontend candidate trả HTTP 200 cho `/` và `/admin`. HTTP 201 xác nhận ghi ảnh, **không tự chứng minh** ảnh đã đọc được qua `/api/media/...`. Chưa có kết quả kiểm thử đầy đủ luồng đăng bài, backup và Markdown renderer.

---

## 2. Tạo bucket S3

Trên AWS Console: **S3 → Create bucket**:

- Bucket name: `giakhiem-blog-media-2026`.
- Region: **Asia Pacific (Sydney) / ap-southeast-2**, cùng Region với EC2.
- Bucket type: **General purpose**.
- Object Ownership: **ACLs disabled / Bucket owner enforced**.
- **Block all public access**: bật cả bốn tùy chọn.
- Versioning: tắt lúc đầu để hạn chế tích lũy nhiều phiên bản ảnh.
- Default encryption: **SSE-S3**, không cần dùng KMS cho nhu cầu này.
- Không cần bật Static website hosting hoặc Transfer Acceleration.
- Không cần tạo thư mục `images/` bằng tay: S3 dùng object key có prefix `images/`.

### Vì sao bucket private?

Ảnh được upload bằng quyền IAM của backend. Người xem tải ảnh qua endpoint `GET /api/media/{filename}` của FastAPI, backend đọc object từ S3 rồi trả dữ liệu về. Không cần public bucket. Đổi lại, EC2 chịu tải truyền ảnh và có thể phát sinh phí băng thông.

---

## 3. IAM Policy và IAM Role

### 3.1. Policy tối thiểu cho ảnh

AWS Console → **IAM → Policies → Create policy → JSON**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BlogMediaAccess",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::giakhiem-blog-media-2026/images/*"
    }
  ]
}
```

Tên gợi ý: `GiaKhiemBlogS3MediaPolicy`.

Giải thích:

- `Effect: Allow`: cấp quyền cho các hành động chỉ định.
- `s3:GetObject`: đọc file ảnh đã upload.
- `s3:PutObject`: ghi ảnh mới.
- `Resource`: giới hạn **chỉ các object có prefix `images/` trong bucket này**, không cấp quyền cho toàn bộ S3.
- Không có `s3:DeleteObject`: backend không thể xóa ảnh trên S3 với policy này. Xóa bài trong SQLite **không đồng nghĩa** xóa ảnh S3.

### 3.2. Role cho EC2

AWS Console → **IAM → Roles → Create role → AWS service → EC2**; gắn policy ở trên, đặt tên ví dụ `GiaKhiemBlogEC2Role`. Trên **EC2 → Instances → Actions → Security → Modify IAM role**, chọn role tương ứng.

**Nếu EC2 đã có IAM Role**, gắn policy S3 vào role hiện tại thay vì thay thế role và làm mất quyền đang dùng.

IAM Role cho phép SDK `boto3` nhận thông tin xác thực tạm thời, **không lưu AWS Access Key/Secret Key** trong source code hay file `.env`.

### 3.3. Kiểm tra role từ EC2

```bash
aws sts get-caller-identity
```

- `aws`: AWS CLI.
- `sts`: Security Token Service.
- `get-caller-identity`: cho biết danh tính AWS hiện đang được sử dụng (`Account`, `Arn`, `UserId`).
- Thành công chỉ xác nhận có thông tin xác thực; **chưa xác nhận có quyền S3 cụ thể**.

Thử ghi object nhỏ:

```bash
echo "S3 connection test" > /tmp/blog-s3-test.txt

aws s3 cp /tmp/blog-s3-test.txt \
  s3://giakhiem-blog-media-2026/images/connection-test.txt \
  --region ap-southeast-2
```

- `echo`: in chuỗi văn bản.
- `>`: ghi kết quả vào file, thay nội dung cũ nếu đã tồn tại.
- `/tmp/`: thư mục file tạm của Linux.
- `aws s3 cp`: sao chép file local lên S3 hoặc ngược lại.
- `s3://...`: đích S3, trong đó `images/connection-test.txt` là object key.
- `--region`: chọn Region cụ thể.
- Object thử này là file text, chỉ dùng kiểm tra quyền IAM; endpoint upload FastAPI chỉ chấp nhận ảnh.

**Dọn dẹp:** Policy trên không cấp `s3:DeleteObject`, nên nếu muốn xóa object thử, dùng AWS Console với tài khoản có quyền xóa phù hợp; không mở rộng quyền của backend chỉ để xóa file thử.

---

## 4. SSH vào EC2 và kiểm tra tài nguyên

Sau khi đăng nhập SSH vào EC2 Amazon Linux 2023, chạy:

```bash
docker ps
free -h
df -h
sudo ss -lntp | grep ':8001 ' || true
```

| Lệnh/tham số | Ý nghĩa |
|---|---|
| `docker ps` | Liệt kê container **đang chạy**, gồm image, tên, trạng thái, ánh xạ cổng |
| `free -h` | Xem RAM và swap; `-h` hiển thị đơn vị dễ đọc |
| `df -h` | Xem dung lượng filesystem, đặc biệt phân vùng EBS |
| `sudo` | Chạy với quyền quản trị hệ thống |
| `ss -lntp` | Liệt kê socket TCP đang lắng nghe và tiến trình liên quan |
| `grep ':8001 '` | Lọc dòng có cổng 8001 |
| `|| true` | Không coi việc không tìm thấy kết quả là lỗi làm dừng script |

**Vì sao cần kiểm tra?** EC2 `t3.micro` có khoảng 1 GiB RAM; Docker build Node/Vite và FastAPI có thể gây thiếu bộ nhớ. Cần xem tài nguyên trước khi build.

---

## 5. Lấy mã nguồn từ GitHub

```bash
mkdir -p ~/blog-dynamic
cd ~/blog-dynamic

git clone \
  --branch feature/dynamic-blog-api \
  --single-branch \
  https://github.com/giakhiemdt/blog.giakhiem-nguyen.space.git .
```

- `mkdir`: tạo thư mục.
- `-p`: tạo thư mục cha nếu cần, không lỗi nếu thư mục đã tồn tại.
- `~`: home của người dùng SSH, thường `/home/ec2-user`.
- `cd`: chuyển thư mục làm việc.
- `git clone`: tải repository.
- `--branch`: checkout đúng nhánh phát triển.
- `--single-branch`: chỉ lấy lịch sử nhánh được chọn.
- Dấu `.` cuối lệnh: clone vào **thư mục hiện tại**, không tạo thư mục con. Thư mục phải phù hợp (thường trống) khi clone.
- Dấu `\` ở cuối dòng: nối lệnh shell sang dòng tiếp theo.

Sau này, khi đã clone rồi, cập nhật mã nguồn bằng:

```bash
cd ~/blog-dynamic
git switch feature/dynamic-blog-api
git pull origin feature/dynamic-blog-api
```

- `git switch`: chuyển nhánh local.
- `git pull origin <branch>`: fetch và tích hợp commit mới từ nhánh remote vào nhánh local. Nên kiểm tra `git status` trước để tránh ghi đè thay đổi chưa commit.

**Lưu ý:** Các commit ở nhánh `feature/dynamic-blog-api` chưa đồng nghĩa đã merge vào `main`. Workflow production hiện tại theo dõi `main` và có thể triển khai lại frontend cũ nếu được kích hoạt sau này.

---

## 6. Build Docker backend FastAPI

```bash
docker build -t giakhiem-blog-api:local ./backend
```

- `docker build`: xây Docker image từ Dockerfile.
- `-t`: đặt tên/tag cho image.
- `giakhiem-blog-api:local`: tên image và tag `local`, **không phải địa chỉ mạng**.
- `./backend`: build context; Docker đọc `backend/Dockerfile`, `backend/app.py`, `backend/requirements.txt`.
- Backend dùng `python:3.12-slim`, cài FastAPI/Uvicorn/boto3/Pillow, chạy Uvicorn ở cổng **8000 bên trong container**, dùng UID **10001**.

Kiểm tra image:

```bash
docker images | grep giakhiem-blog-api
```

- `docker images`: danh sách image trên host.
- `|`: pipe đầu ra lệnh trái vào lệnh phải.
- `grep`: tìm dòng khớp tên image.

---

## 7. Lưu SQLite bền vững trên EBS

```bash
sudo mkdir -p /opt/giakhiem-blog/data
sudo chown 10001:10001 /opt/giakhiem-blog/data
sudo chmod 700 /opt/giakhiem-blog/data
```

- `/opt/giakhiem-blog/data`: thư mục **trên host EC2/EBS**, không nằm trong image.
- `chown 10001:10001`: đổi chủ sở hữu user/group sang UID/GID 10001 để tiến trình backend không chạy root vẫn ghi được SQLite.
- `chmod 700`: chỉ chủ sở hữu được đọc/ghi/truy cập thư mục.
- SQLite thực tế lưu tại `/data/blog.db` **bên trong container**, nhờ volume mapping nên tương ứng với `/opt/giakhiem-blog/data/blog.db` trên host.
- SQLite bật WAL: có thể có file `blog.db-wal` và `blog.db-shm`; **không chỉ copy riêng `blog.db` khi ứng dụng đang ghi** để làm backup.

### File cấu hình môi trường

```bash
sudo nano /opt/giakhiem-blog/blog-api.env
```

Nội dung minh họa (không dùng nguyên mật khẩu mẫu):

```ini
BLOG_ADMIN_USER=admin
BLOG_ADMIN_PASSWORD=THAY_BANG_MAT_KHAU_DAI_NGAU_NHIEN
BLOG_S3_BUCKET=giakhiem-blog-media-2026
AWS_DEFAULT_REGION=ap-southeast-2
```

```bash
sudo chown root:root /opt/giakhiem-blog/blog-api.env
sudo chmod 600 /opt/giakhiem-blog/blog-api.env
```

- `nano`: trình sửa file trong terminal.
- `BLOG_ADMIN_USER/PASSWORD`: tài khoản HTTP Basic cho API quản trị.
- `BLOG_S3_BUCKET`: tên bucket backend sử dụng.
- `AWS_DEFAULT_REGION`: Region AWS SDK/CLI.
- `chown root:root`: file thuộc root.
- `chmod 600`: chỉ root có quyền đọc/ghi.
- **Không commit file env lên GitHub, không gửi mật khẩu trong chat và không đưa mật khẩu trực tiếp vào câu lệnh shell.**

---

## 8. Chạy backend bằng Docker

```bash
docker run -d \
  --name blog-api \
  --restart unless-stopped \
  --memory 256m \
  --cpus 0.75 \
  -p 127.0.0.1:8001:8000 \
  -v /opt/giakhiem-blog/data:/data \
  --env-file /opt/giakhiem-blog/blog-api.env \
  giakhiem-blog-api:local
```

| Tham số | Ý nghĩa |
|---|---|
| `docker run` | Tạo và chạy container mới từ image |
| `-d` | Chạy nền, trả về container ID |
| `--name blog-api` | Đặt tên container dễ quản lý |
| `--restart unless-stopped` | Tự khởi động lại khi Docker/EC2 khởi động, trừ trường hợp đã chủ động stop |
| `--memory 256m` | Giới hạn RAM container ở 256 MiB; quá ít có thể gây OOM |
| `--cpus 0.75` | Giới hạn CPU tương đương 0,75 CPU logic |
| `-p 127.0.0.1:8001:8000` | Chỉ mở **host loopback 8001** tới **container 8000** |
| `-v HOST:CONTAINER` | Bind mount dữ liệu host vào container, giữ SQLite khi container bị thay |
| `--env-file` | Nạp biến môi trường từ file trên host |
| `giakhiem-blog-api:local` | Image được chạy |

**Tại sao bind vào 127.0.0.1?** FastAPI không được truy cập trực tiếp từ Internet qua cổng 8001; Nginx host làm reverse proxy qua HTTPS.

Kiểm tra:

```bash
docker ps --filter name=blog-api
docker logs --tail 50 blog-api
curl -i http://127.0.0.1:8001/api/health
curl http://127.0.0.1:8001/api/posts
curl -i http://127.0.0.1:8001/api/admin/me
```

- `--filter name=...`: chỉ hiển thị container khớp tên.
- `docker logs --tail 50`: 50 dòng log cuối.
- `curl`: gửi HTTP request.
- `-i`: hiển thị cả HTTP response headers.
- `/api/health`: endpoint health check, mong đợi HTTP 200 và `{"status":"ok"}`.
- `/api/posts`: chỉ liệt kê bài đã xuất bản; ban đầu danh sách rỗng.
- `/api/admin/me` **không có auth**: mong đợi HTTP 401.

### Kiểm tra IAM từ bên trong container

```bash
docker exec blog-api python -c \
  "import boto3; print(boto3.client('sts').get_caller_identity()['Arn'])"
```

- `docker exec`: chạy lệnh trong container **đang chạy**.
- `python -c`: thực thi đoạn Python ngắn.
- `boto3.client('sts')`: tạo AWS STS client.
- `get_caller_identity()['Arn']`: in danh tính AWS mà container đang sử dụng.
- Nếu host nhận được role nhưng container không nhận, kiểm tra IMDSv2, instance metadata hop limit và mạng Docker; **không giải quyết bằng cách hard-code AWS keys**.

---

## 9. Cấu hình Nginx reverse proxy và HTTPS

Cấu hình host đang có SSL từ Certbot, frontend được proxy về `127.0.0.1:8080`.

Tìm file cấu hình thực tế:

```bash
sudo grep -Rl \
  'server_name blog.giakhiem-nguyen.space' \
  /etc/nginx/conf.d /etc/nginx/nginx.conf
```

- `grep -R`: tìm đệ quy.
- `-l`: chỉ in tên file khớp.
- Không giả định đường dẫn file; ví dụ dưới đây dùng `/etc/nginx/conf.d/blog.conf`, **phải thay bằng đường dẫn thực tế**.

Sao lưu:

```bash
sudo cp /etc/nginx/conf.d/blog.conf \
  /etc/nginx/conf.d/blog.conf.bak
sudo nano /etc/nginx/conf.d/blog.conf
```

- `cp`: sao chép file; bản `.bak` để khôi phục khi cấu hình lỗi.
- Sửa **server block HTTPS** có `server_name blog.giakhiem-nguyen.space`, giữ nguyên SSL/Certbot và redirect HTTP→HTTPS.

Thêm `location /api/` **trước** `location /` (Nginx chọn prefix cụ thể nhất):

```nginx
client_max_body_size 6m;

location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}

location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Giải thích:

- `client_max_body_size 6m`: Nginx cho phép request body tối đa khoảng 6 MiB; API tự giới hạn ảnh 5 MiB.
- `location /api/`: tất cả đường dẫn API được gửi đến backend.
- `proxy_pass http://127.0.0.1:8001;`: chuyển request sang FastAPI; **không thêm dấu `/` ở cuối** nếu muốn giữ nguyên `/api/...`.
- `proxy_http_version 1.1`: giao tiếp HTTP/1.1 tới upstream.
- `Host`: giữ hostname gốc.
- `X-Real-IP`, `X-Forwarded-For`: truyền thông tin IP client; khi có Cloudflare phải cấu hình trust proxy đúng nếu dùng để giới hạn truy cập.
- `X-Forwarded-Proto`: báo scheme gốc (HTTPS).
- `proxy_connect_timeout`, `proxy_read_timeout`: giới hạn thời gian kết nối/đọc upstream.
- `location /`: chuyển trang web và SPA route `/admin` sang frontend.

**Quan trọng:** `nginx.conf` trong repository là Nginx **bên trong frontend Docker**, không phải Nginx host chịu trách nhiệm `/api/`.

Kiểm tra trước khi áp dụng:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

- `nginx -t`: kiểm tra cú pháp và khả năng tải cấu hình; **chỉ reload nếu test thành công**.
- `systemctl reload nginx`: nạp lại cấu hình mà không dừng hẳn service.

Kiểm tra HTTPS:

```bash
curl -i https://blog.giakhiem-nguyen.space/api/health
curl -i https://blog.giakhiem-nguyen.space/api/posts
curl -i https://blog.giakhiem-nguyen.space/api/admin/me
```

Mong đợi: health **200**, public posts **200**, admin không auth **401**.

---

## 10. Kiểm tra HTTP Basic Authentication

```bash
curl -i -u admin \
  https://blog.giakhiem-nguyen.space/api/admin/me
```

- `-u admin`: dùng username `admin`, cURL sẽ hỏi mật khẩu tương tác.
- Không ghi `admin:password` trực tiếp trong shell history.
- HTTP Basic mã hóa username/password theo Base64 **không phải mã hóa bảo mật**; vì vậy chỉ dùng qua HTTPS.
- Thành công: HTTP 200 và JSON role admin; sai thông tin: HTTP 401.

### Các endpoint chính

| Phương thức | Endpoint | Ý nghĩa |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/posts` | Danh sách bài published |
| GET | `/api/posts/{slug}` | Chi tiết bài published |
| GET | `/api/admin/me` | Xác thực tài khoản quản trị |
| GET | `/api/admin/posts` | Danh sách tất cả bài, gồm draft |
| POST | `/api/admin/posts` | Tạo bài |
| PUT | `/api/admin/posts/{id}` | Sửa bài |
| DELETE | `/api/admin/posts/{id}` | Xóa bài trong SQLite |
| POST | `/api/admin/images` | Upload ảnh private lên S3 |
| GET | `/api/media/{filename}` | Backend đọc ảnh từ S3 và trả về |

Các endpoint `/api/admin/*` yêu cầu HTTP Basic; endpoint public không yêu cầu đăng nhập.

---

## 11. Kiểm thử upload ảnh S3

### 11.1. Lỗi thực tế đã gặp: cURL exit code 26

Lệnh:

```bash
curl -i -u admin \
  -F "file=@/tmp/test.jpg" \
  https://blog.giakhiem-nguyen.space/api/admin/images
```

Ban đầu trả về:

```text
curl: (26) Failed to open/read local data from file/application
```

**Nguyên nhân:** `/tmp/test.jpg` chưa tồn tại trên EC2; đây không phải lỗi S3/IAM.

Kiểm tra:

```bash
ls -lh /tmp/test.jpg
```

- `ls`: liệt kê file.
- `-l`: thông tin chi tiết.
- `-h`: kích thước dễ đọc.

### 11.2. Tạo ảnh JPEG thử bằng Pillow trong container

```bash
docker exec blog-api python -c "
from PIL import Image
img = Image.new('RGB', (800, 450), color=(70, 130, 180))
img.save('/tmp/test.jpg', 'JPEG')
"

docker cp blog-api:/tmp/test.jpg /tmp/test.jpg
ls -lh /tmp/test.jpg
```

- `Image.new('RGB', (800,450), ...)`: tạo ảnh RGB 800×450.
- `img.save(..., 'JPEG')`: lưu file JPEG hợp lệ.
- `docker cp CONTAINER:SOURCE DEST`: sao chép file từ container ra host.
- Ảnh này chỉ để kiểm thử, không phải ảnh nội dung thật.

### 11.3. Upload ảnh

```bash
curl -i -u admin \
  -F "file=@/tmp/test.jpg" \
  https://blog.giakhiem-nguyen.space/api/admin/images
```

- `-F`: gửi multipart form-data.
- `file=@/tmp/test.jpg`: field form tên `file`, nội dung lấy từ file local; dấu `@` có ý nghĩa **đọc file**.
- `-u admin`: yêu cầu nhập mật khẩu tương tác.
- HTTP **201 Created**: API đã chấp nhận upload và ghi object lên S3 thành công.

Kết quả thực tế trong phiên triển khai: **HTTP/2 201**, phản hồi qua Cloudflare. Nếu muốn xem JSON ngắn gọn:

```bash
curl -sS -u admin \
  -F "file=@/tmp/test.jpg" \
  https://blog.giakhiem-nguyen.space/api/admin/images
```

- `-sS`: ẩn progress bar nhưng vẫn in lỗi.
- Phản hồi chứa `url` dạng `/api/media/<32-hex-chars>.jpg` và `size`.
- Lệnh này **upload thêm một object mới** mỗi lần chạy, không chỉ đọc lại phản hồi cũ.

### 11.4. Kiểm tra đọc ảnh

Dùng **đúng URL từ JSON trả về**, ví dụ:

```bash
curl -I "https://blog.giakhiem-nguyen.space/api/media/THAY_BANG_TEN_ANH_THUC_TE.jpg"
```

**Chú ý:** FastAPI route chỉ khai báo `GET`, vì vậy `curl -I` gửi HEAD có thể trả **405 Method Not Allowed** dù GET ảnh hoạt động. Cách kiểm tra chắc chắn hơn:

```bash
curl -fL \
  "https://blog.giakhiem-nguyen.space/api/media/THAY_BANG_TEN_ANH_THUC_TE.jpg" \
  -o /tmp/downloaded-test.jpg

file /tmp/downloaded-test.jpg
```

- `-f`: lỗi HTTP 4xx/5xx làm cURL thất bại.
- `-L`: theo redirect nếu có.
- `-o`: ghi response body ra file.
- `file`: nhận diện định dạng file tải về.
- Hoặc mở URL trên trình duyệt và xác nhận ảnh hiển thị.

---

## 12. Build frontend React/Vite

Sau khi cập nhật nhánh:

```bash
cd ~/blog-dynamic
git switch feature/dynamic-blog-api
git pull origin feature/dynamic-blog-api
docker build -t giakhiem-blog-web:v2 .
```

- `docker build`: build Docker image.
- `-t giakhiem-blog-web:v2`: đặt tag frontend thử nghiệm.
- Dấu `.`: build context là thư mục gốc repo; Dockerfile dùng Node 22 để chạy `npm ci`, `npm run build`, rồi copy `dist/` vào Nginx image.
- `npm ci`: cài dependency theo lockfile.
- `npm run build`: chạy TypeScript check + Vite build.
- Nếu build lỗi `Killed` hoặc exit 137, có thể thiếu RAM; cân nhắc build trên GitHub Actions thay vì EC2.

### Frontend candidate không ảnh hưởng production

```bash
docker rm -f blog-candidate 2>/dev/null || true

docker run -d \
  --name blog-candidate \
  -p 127.0.0.1:8081:80 \
  giakhiem-blog-web:v2
```

- `docker rm -f`: xóa container cùng tên nếu có; **không xóa image**.
- `2>/dev/null`: bỏ thông báo lỗi stderr khi container chưa tồn tại.
- `|| true`: không dừng vì lỗi không đáng kể.
- `--name blog-candidate`: container frontend thử nghiệm.
- `-p 127.0.0.1:8081:80`: host cổng 8081, container cổng 80; chỉ truy cập local.

Kiểm tra:

```bash
docker ps
curl -I http://127.0.0.1:8081/
curl -I http://127.0.0.1:8081/admin
```

- `curl -I`: gửi HTTP HEAD, chỉ lấy headers.
- Kết quả thực tế: cả hai trả HTTP **200** từ Nginx 1.30.6.
- **Giới hạn:** HTTP 200 chỉ chứng minh Nginx phục vụ SPA HTML; chưa chứng minh JavaScript hoạt động, API đăng nhập thành công hay tạo bài được.

---

## 13. Thay frontend production và xử lý lỗi tên backup

### 13.1. Lỗi thực tế đã gặp

Lệnh:

```bash
docker stop blog
docker rename blog blog-previous
```

- `docker stop blog`: dừng container frontend cũ, làm cổng 8080 tạm thời không phục vụ.
- `docker rename blog blog-previous`: đổi tên container để giữ lại làm bản rollback.

Lần triển khai này, `docker rename` thất bại vì đã tồn tại container `blog-previous` từ lần deploy trước. **Không phải lỗi Docker image hoặc FastAPI.** Do `docker stop` đã chạy trước, frontend production bị dừng tạm thời.

### 13.2. Khôi phục website ngay

```bash
docker start blog
curl -I http://127.0.0.1:8080/
```

- `docker start`: khởi động lại container đã dừng.
- Kiểm tra HTTP 200 trước khi tiếp tục.

### 13.3. Giải quyết tên backup trùng

```bash
docker rename blog-previous blog-backup-older
```

- Giữ bản backup cũ bằng tên khác thay vì xóa.
- Nếu tên `blog-backup-older` đã tồn tại, chọn tên khác chưa sử dụng; kiểm tra bằng `docker ps -a`.

### 13.4. Đưa frontend mới lên cổng production

```bash
docker stop blog
docker rename blog blog-previous

docker run -d \
  --name blog \
  --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  giakhiem-blog-web:v2
```

- Container cũ được giữ dưới tên `blog-previous` (đã dừng).
- Container mới có tên `blog` và tiếp tục phục vụ tại host cổng `8080`.
- Nginx host không phải đổi `proxy_pass` vì cổng không đổi.
- Đây là thao tác có **khoảng ngắt ngắn** giữa stop container cũ và start container mới; không phải zero-downtime deployment.

Kiểm tra:

```bash
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:8080/admin
curl -i https://blog.giakhiem-nguyen.space/api/health
```

### 13.5. Rollback nếu frontend mới lỗi

```bash
docker rm -f blog
docker rename blog-previous blog
docker start blog
```

- `docker rm -f blog`: dừng và xóa container frontend mới; **không xóa image**.
- `docker rename`: trả lại tên `blog` cho container cũ.
- `docker start`: chạy lại frontend cũ trên 8080.
- **Không dùng các lệnh này tùy tiện khi frontend mới đang hoạt động tốt.**
- Rollback frontend không tự rollback schema/data backend.

---

## 14. Truy cập quản trị và kiểm thử nghiệp vụ

Trang quản trị: `https://blog.giakhiem-nguyen.space/admin`.

Đăng nhập bằng username/password trong `/opt/giakhiem-blog/blog-api.env` (không đưa thông tin này vào URL hoặc repo).

Checklist kiểm thử:

- [ ] Đăng nhập admin thành công.
- [ ] Tạo bài mới ở trạng thái **draft**.
- [ ] Xác nhận bài draft **không xuất hiện** ở `/api/posts` và trang chủ.
- [ ] Đổi trạng thái sang **published**, kiểm tra bài xuất hiện công khai.
- [ ] Sửa tiêu đề/nội dung và kiểm tra thay đổi.
- [ ] Upload ảnh bìa, kiểm tra S3 và URL `/api/media/...` hiển thị.
- [ ] Xóa bài và xác nhận biến mất khỏi danh sách công khai.
- [ ] Thử đăng nhập sai và xác nhận không có quyền quản trị.
- [ ] Kiểm tra giao diện trên mobile.

**Hiện trạng giới hạn:** nội dung bài được hiển thị như văn bản, chưa có Markdown renderer hoàn chỉnh; ảnh trong body chưa có quy trình chèn riêng; UI có nội dung demo fallback khi API lỗi; đăng nhập Basic chưa có rate limiting chuyên biệt.

---

## 15. Vận hành hằng ngày

```bash
# Xem toàn bộ container, kể cả container đã dừng
docker ps -a

# Xem log backend
docker logs --tail 100 blog-api

# Theo dõi log liên tục (Ctrl+C để thoát)
docker logs -f blog-api

# Xem tài nguyên container
docker stats --no-stream

# Kiểm tra sức khỏe backend local
curl -fsS http://127.0.0.1:8001/api/health

# Kiểm tra frontend local
curl -I http://127.0.0.1:8080/

# Kiểm tra cấu hình Nginx
sudo nginx -t
```

- `docker ps -a`: cả container đang chạy và đã dừng.
- `docker logs -f`: theo dõi log theo thời gian thực.
- `docker stats --no-stream`: chụp một lần CPU/RAM/I/O.
- `curl -fsS`: thất bại với HTTP lỗi, ẩn progress, vẫn hiện thông báo lỗi.
- `Ctrl+C`: thoát chế độ theo dõi log.

### Cập nhật backend thủ công

```bash
cd ~/blog-dynamic
git pull origin feature/dynamic-blog-api
docker build -t giakhiem-blog-api:local ./backend

docker stop blog-api
docker rm blog-api

docker run -d \
  --name blog-api \
  --restart unless-stopped \
  --memory 256m --cpus 0.75 \
  -p 127.0.0.1:8001:8000 \
  -v /opt/giakhiem-blog/data:/data \
  --env-file /opt/giakhiem-blog/blog-api.env \
  giakhiem-blog-api:local
```

- `docker stop`: dừng container cũ.
- `docker rm`: xóa container cũ; **không xóa bind-mounted SQLite** ở `/opt/giakhiem-blog/data`.
- `docker run`: tạo container mới từ image vừa build, mount lại cùng database.
- Có downtime ngắn trong lúc thay container. **Cần backup SQLite trước những thay đổi backend có migration/schema.**

### Kiểm tra thư mục dữ liệu

```bash
sudo ls -lah /opt/giakhiem-blog/data
```

Không sửa/xóa file SQLite khi backend đang chạy nếu không hiểu rõ WAL và tính nhất quán.

---

## 16. Chi phí AWS và các rủi ro cần nhớ

- **EC2 t3.micro:** chi phí instance, EBS và IPv4 public (nếu có) phụ thuộc gói Free Tier/credits và bảng giá tại thời điểm dùng; không mặc định mọi thứ miễn phí.
- **S3:** phí lưu trữ theo GB-tháng, PUT/GET request và có thể có phí truyền dữ liệu. Bucket private không đồng nghĩa miễn phí.
- **Cùng Region:** EC2 và S3 đều ở Sydney giúp tránh mô hình truyền dữ liệu liên Region không cần thiết, nhưng không bảo đảm mọi loại traffic đều miễn phí.
- **Proxy ảnh qua EC2:** đơn giản nhưng mỗi lần đọc ảnh có thể làm tăng request S3, băng thông và CPU EC2.
- **SQLite trên EBS:** xóa container không làm mất bind mount, nhưng mất EBS hoặc xóa volume vẫn có thể mất dữ liệu. **Chưa có backup off-instance tự động.**
- **S3 không tự dọn ảnh khi xóa bài:** object cũ có thể tồn tại và tăng chi phí.
- **HTTP Basic:** chỉ dùng HTTPS, mật khẩu mạnh, cần rate limiting và bảo vệ admin.
- **CI/CD:** workflow `main` hiện chỉ deploy frontend; chưa có pipeline production thống nhất cho backend. Một deploy từ `main` có thể ghi đè frontend mới nếu nhánh chưa được merge.
- **Cloudflare:** phản hồi có `server: cloudflare` nghĩa là request đi qua proxy; không chứng minh Cloudflare đang cache nội dung.
- **Kiểm thử:** HTTP 200 cho HTML và HTTP 201 upload không thay thế kiểm thử nghiệp vụ trong trình duyệt.

### Việc nên làm tiếp theo (ưu tiên)

1. Kiểm thử toàn bộ luồng admin tạo/sửa/xuất bản/xóa bài và hiển thị ảnh.
2. Backup SQLite bằng **SQLite Online Backup API**, tải bản backup lên S3 theo lịch, thử restore.
3. Bổ sung rate limiting và cơ chế bảo vệ endpoint admin; cân nhắc Cloudflare Access.
4. Bổ sung Markdown renderer an toàn, hỗ trợ ảnh trong nội dung.
5. Hoàn thiện CI/CD frontend + backend, kiểm thử và rollback.
6. Dọn object thử, container candidate/backup không còn cần thiết và kiểm soát retention S3.

---

## 17. Liên kết mã nguồn và tài liệu liên quan

- Repo: https://github.com/giakhiemdt/blog.giakhiem-nguyen.space
- Nhánh phát triển: https://github.com/giakhiemdt/blog.giakhiem-nguyen.space/tree/feature/dynamic-blog-api
- Backend: `backend/app.py`, `backend/Dockerfile`, `backend/requirements.txt`
- Frontend admin: `src/Admin.tsx`, `src/admin.css`
- Frontend blog: `src/App.tsx`
- Host Nginx: cấu hình nằm trên EC2 (không phải file `nginx.conf` trong repo)
- Tài liệu S3: `doc/DYNAMIC_BLOG_S3.md`
- Tài liệu backend deployment: `doc/DEPLOY_DYNAMIC_BLOG_EC2.md`

> **Bảo mật tài liệu:** Không đưa password admin, private SSH key, AWS access key, nội dung `blog-api.env` hoặc thông tin xác thực thật vào GitHub.
