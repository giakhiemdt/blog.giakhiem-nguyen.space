# CI/CD cho blog React/Vite trên AWS EC2

> Tài liệu ghi lại kiến trúc, các bước thiết lập, cơ chế triển khai và cách xử lý sự cố đã áp dụng cho repository `giakhiemdt/blog.giakhiem-nguyen.space`. Cập nhật: 04/11/2026.

## 1. Tổng quan

Blog sử dụng React + TypeScript + Vite. Mã nguồn nằm trên GitHub, GitHub Actions xây dựng Docker image, đẩy lên GitHub Container Registry (GHCR), sau đó kết nối SSH tới EC2 để cập nhật container. Nginx cài trực tiếp trên EC2 làm reverse proxy và xử lý HTTPS bằng chứng chỉ Certbot; Cloudflare đứng phía trước domain.

```text
Developer -> git push main -> GitHub Actions
                               | build Docker image (Node 22 -> Nginx)
                               v
                         GHCR public image
                               |
                               | SSH, docker pull, smoke test
                               v
                        AWS EC2 (Amazon Linux 2023)
                               |
Internet -> Cloudflare -> Nginx host :443 (Certbot TLS)
                               |
                               v
                        127.0.0.1:8080
                               |
                               v
                        Docker container blog :80
                               |
                               v
                        React/Vite static dist/
```

**Thông tin triển khai:**

| Thành phần | Giá trị |
| --- | --- |
| Repository | `giakhiemdt/blog.giakhiem-nguyen.space` |
| Nhánh deploy | `main` |
| Domain | `blog.giakhiem-nguyen.space` |
| Máy chủ | AWS EC2 t3.micro, Amazon Linux 2023 |
| User SSH | `ec2-user` |
| Registry | `ghcr.io` |
| Image | `ghcr.io/giakhiemdt/blog.giakhiem-nguyen.space:<commit-sha>` |
| Container production | `blog` |
| Cổng nội bộ production | `127.0.0.1:8080:80` |
| Cổng thử nghiệm candidate | `127.0.0.1:8081:80` |
| Nginx host | `/etc/nginx/conf.d/blog.conf` |
| Chứng chỉ TLS | `/etc/letsencrypt/live/blog.giakhiem-nguyen.space/` |

Không đưa địa chỉ IP EC2, SSH private key hay secret vào repository.

## 2. Những file quan trọng

- `Dockerfile`: multi-stage build, dùng `node:22-alpine` chạy `npm ci` và `npm run build`, rồi dùng `nginx:stable-alpine` phục vụ nội dung `dist/`.
- `.dockerignore`: tránh đưa các file không cần thiết vào Docker build context.
- `nginx.conf`: cấu hình **Nginx bên trong container**, hỗ trợ SPA fallback `try_files $uri $uri/ /index.html` và cache asset tĩnh.
- `.github/workflows/deploy-ec2.yml`: pipeline **tự động** build image, push GHCR và deploy EC2.
- `.github/workflows/build-image.yml`: workflow **thủ công** để build và push image; không deploy EC2.
- `.github/workflows/test-ec2.yml`: workflow kiểm tra SSH tới EC2.
- `.github/workflows/deploy.yml`: workflow GitHub Pages cũ, **vẫn tồn tại và vẫn chạy khi push main**. Nó độc lập với EC2; nếu không còn sử dụng GitHub Pages, có thể cân nhắc vô hiệu hóa sau khi kiểm tra cấu hình domain/Pages.

**Phân biệt hai Nginx:** `nginx.conf` trong repo là Nginx của container (HTTP cổng 80); `/etc/nginx/conf.d/blog.conf` trên EC2 là Nginx host (HTTPS cổng 443 và reverse proxy). Sửa một file không tự sửa file còn lại.

## 3. Chuẩn bị EC2

1. Tạo EC2 và cài Docker; bảo đảm user `ec2-user` có quyền chạy `docker` mà không cần `sudo` (đăng nhập lại nếu vừa thêm vào nhóm `docker`).
2. Cài Nginx host và Certbot, cấu hình domain và chứng chỉ HTTPS.
3. Cho phép inbound 80/443 trong Security Group theo nhu cầu truy cập công khai; SSH 22 nên giới hạn nguồn truy cập phù hợp. **Không mở 8080 hoặc 8081 công khai**.
4. Trên máy t3.micro (~1 GiB RAM), đã cấu hình swap 1 GiB để giảm nguy cơ hết RAM. Swap không thay thế RAM và không bảo đảm tránh OOM.
5. Kiểm tra:

```bash
docker --version
docker ps
free -h
sudo nginx -t
```

## 4. Thiết lập xác thực GitHub Actions -> EC2

Tạo một cặp khóa SSH ED25519 riêng cho deploy. Public key được thêm vào `/home/ec2-user/.ssh/authorized_keys` trên EC2. Private key được lưu trong GitHub Actions repository secret, **không commit vào git**.

Các secrets cần có tại **Settings -> Secrets and variables -> Actions**:

| Secret | Nội dung |
| --- | --- |
| `EC2_HOST` | Public IP hoặc DNS công khai của EC2, có thể truy cập từ GitHub-hosted runner |
| `EC2_SSH_KEY` | Nội dung đầy đủ private key ED25519 |
| `EC2_KNOWN_HOSTS` | Dòng host key SSH của EC2 đã được kiểm tra fingerprint qua kênh đáng tin cậy |

Workflow dùng `StrictHostKeyChecking=yes`, `BatchMode=yes`, user `ec2-user`. Có thể chạy `test-ec2.yml` thủ công để kiểm tra kết nối trước khi deploy.

**Lưu ý:** `ssh-keyscan` tự nó không xác minh danh tính máy chủ; cần đối chiếu fingerprint trước khi lưu `EC2_KNOWN_HOSTS`. Nếu EC2 đổi public IP, cập nhật `EC2_HOST` (hoặc dùng Elastic IP/DNS ổn định). EC2 phải cho phép GitHub runner kết nối SSH.

## 5. GHCR và Docker image

Workflow đăng nhập GHCR bằng `GITHUB_TOKEN` có quyền `packages: write`. Image được build cho `linux/amd64`, tương ứng EC2 x86_64.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Production deploy dùng tag chính xác theo SHA commit: `ghcr.io/giakhiemdt/blog.giakhiem-nguyen.space:<commit-sha>`. Điều này giúp truy vết phiên bản và rollback. Workflow `build-image.yml` thủ công còn tạo tag `latest`, nhưng pipeline deploy tự động **không phụ thuộc vào `latest`**.

Package GHCR đã được đặt public để EC2 có thể `docker pull` không cần lưu registry token trên máy chủ. Nếu chuyển package sang private, cần thiết kế lại xác thực pull an toàn.

## 6. Cơ chế tự động deploy

File: `.github/workflows/deploy-ec2.yml`.

**Trigger:**
- Mỗi `push` lên `main` (bao gồm commit sửa tài liệu này).
- `workflow_dispatch`: chạy thủ công trong tab Actions.

**Các bước:**

1. Checkout mã nguồn.
2. Thiết lập Docker Buildx, đăng nhập GHCR.
3. Build/push image theo `github.sha` (dùng cache GitHub Actions).
4. Cấu hình SSH bằng secrets, kiểm tra host key.
5. SSH vào EC2 và `docker pull` image mới.
6. Tạo container `blog-candidate` trên `127.0.0.1:8081`.
7. Smoke test HTTP `/`: thử tối đa 15 lần, mỗi lần cách 2 giây; kiểm tra container còn chạy và in log khi lỗi.
8. Nếu candidate đạt, xóa candidate, xóa container thử nghiệm `blog-test` nếu có.
9. Xóa `blog-previous` cũ; nếu `blog` hiện tại tồn tại thì stop và rename thành `blog-previous`.
10. Tạo `blog` mới trên `127.0.0.1:8080`, `--restart unless-stopped`.
11. Chờ HTTP `/` trả thành công. Nếu thất bại, xóa `blog` lỗi, đổi tên `blog-previous` thành `blog` và start lại (nếu có).

**Giới hạn hiện tại:** Đây **không phải zero-downtime deployment**. Có một khoảng gián đoạn ngắn khi dừng container cũ và khởi động container mới. Rollback chỉ khả dụng khi tồn tại `blog-previous`; pipeline giữ tối đa một container cũ và xóa bản rollback cũ trước mỗi lượt deploy. Candidate smoke test chỉ xác minh HTTP `/`, không phải kiểm thử toàn bộ ứng dụng.

`concurrency` được cấu hình để các lượt deploy thuộc cùng nhóm không chạy đồng thời; `cancel-in-progress: false`. Các lượt push liên tiếp có thể tạo nhiều workflow runs, và GitHub Actions có thể thay thế một lượt **đang chờ** bằng lượt mới hơn. Hãy kiểm tra lượt chạy gắn với commit mới nhất.

## 7. Nginx host, HTTPS và Cloudflare

File **trên EC2**: `/etc/nginx/conf.d/blog.conf` (không nằm trong repo). Cấu hình đã áp dụng:

```nginx
server {
    listen 443 ssl;
    server_name blog.giakhiem-nguyen.space;

    ssl_certificate /etc/letsencrypt/live/blog.giakhiem-nguyen.space/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.giakhiem-nguyen.space/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name blog.giakhiem-nguyen.space;
    return 301 https://$host$request_uri;
}
```

Đây là cấu hình tham chiếu của lần chuyển đổi; nếu Certbot thay đổi cấu hình trong tương lai, hãy kiểm tra file thực tế trước khi ghi đè. Chứng chỉ do Certbot quản lý, không lưu private key trong repo.

Khi sửa Nginx host:

```bash
sudo cp /etc/nginx/conf.d/blog.conf /etc/nginx/conf.d/blog.conf.bak
sudo nginx -t
sudo systemctl reload nginx
```

Nên chỉ reload khi `nginx -t` thành công. Cổng 8080 được bind trên loopback nên truy cập từ Nginx host, không phải Internet trực tiếp. Cloudflare làm DNS/proxy ở phía trước; cấu hình SSL/TLS Cloudflare cần phù hợp với HTTPS origin.

## 8. Xác minh sau khi push

1. Push commit lên `main`.
2. Mở [Deploy blog to EC2](https://github.com/giakhiemdt/blog.giakhiem-nguyen.space/actions/workflows/deploy-ec2.yml), kiểm tra lượt chạy của commit mới nhất có trạng thái success.
3. Trên EC2:

```bash
docker ps --format 'table {{.Image}}\t{{.Status}}\t{{.Names}}'
curl -I http://127.0.0.1:8080/
docker logs --tail 50 blog
```

4. Kiểm tra Nginx host, bỏ qua Cloudflare:

```bash
curl -I --resolve blog.giakhiem-nguyen.space:443:127.0.0.1 \
  https://blog.giakhiem-nguyen.space/
```

5. Kiểm tra domain công khai:

```bash
curl -I https://blog.giakhiem-nguyen.space/
```

6. Tải lại trình duyệt bằng Ctrl+F5 nếu còn thấy nội dung cũ. Để xác nhận request đi vào Docker, kiểm tra `docker logs --since 1m blog` sau một request tới origin.

**Không chỉ dựa vào HTTP 200 ở Cloudflare**: Nginx host có thể vẫn phục vụ thư mục tĩnh cũ. Trong lần thiết lập ban đầu, `Last-Modified` giữa container và domain khác nhau đã giúp phát hiện lỗi này.

## 9. Sự cố đã gặp và cách xử lý

### Workflow lỗi `curl: (56) Recv failure: Connection reset by peer`

Image pull thành công, nhưng kiểm tra HTTP ngay sau `docker run` có thể quá sớm vì Nginx container chưa sẵn sàng. Đã sửa bằng hàm `wait_for_http` thử lại tối đa khoảng 30 giây, kiểm tra trạng thái container và in 100 dòng log khi lỗi.

### Container không tồn tại sau deploy lỗi

Nếu đây là lần triển khai đầu tiên và không có `blog-previous`, rollback không thể phục hồi một container chưa từng tồn tại. Xem log workflow và thử image riêng trên cổng 8082:

```bash
docker run -d --name blog-debug -p 127.0.0.1:8082:80 IMAGE
curl -I http://127.0.0.1:8082/
docker logs --tail 100 blog-debug
docker rm -f blog-debug
```

Thay `IMAGE` bằng image GHCR và tag SHA cụ thể.

### HTTP 502 từ Nginx host

```bash
docker ps -a
curl -v http://127.0.0.1:8080/
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
getenforce
```

Kiểm tra container, kết nối loopback, log Nginx và chính sách SELinux nếu đang `Enforcing`. Không tắt SELinux chỉ để bỏ qua lỗi.

### RAM thấp

```bash
free -h
docker stats --no-stream
docker logs --tail 100 blog
```

Máy t3.micro có tài nguyên hạn chế; build image được thực hiện trên GitHub-hosted runner, **không build trên EC2**, nhằm giảm tải máy chủ. Theo dõi RAM, swap, disk và log khi mở rộng dịch vụ.

### SSH lỗi

Kiểm tra `EC2_HOST`, `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`, public key trong `authorized_keys`, Security Group cổng 22, và trạng thái EC2. Không tắt host-key verification để khắc phục tạm.

## 10. Rollback thủ công và vận hành

Nếu còn `blog-previous`, có thể xem trạng thái:

```bash
docker ps -a --filter name=blog
docker inspect blog-previous
```

**Không chạy rollback thủ công khi workflow đang deploy.** Khi cần rollback, dừng/đổi tên container một cách có kiểm soát, bảo đảm cổng 8080 được giải phóng và image cũ còn sẵn. Một cách an toàn hơn cho các phiên bản về sau là lưu SHA đã triển khai thành công, cho phép chọn SHA cụ thể khi chạy `workflow_dispatch` hoặc triển khai blue/green.

Các lệnh thường dùng:

```bash
docker ps -a
docker logs --tail 100 blog
docker inspect blog --format '{{.Config.Image}}'
sudo systemctl status nginx
sudo nginx -t
curl -I http://127.0.0.1:8080/
```

Không dùng `docker system prune -a` tùy tiện: lệnh này có thể xóa image cũ cần để rollback.

## 11. Cách cập nhật website về sau

Chỉnh sửa `src/App.tsx`, CSS, bài viết hoặc tài nguyên trong repo rồi commit/push lên `main`. GitHub Actions sẽ tự build image mới và triển khai EC2. Không cần SSH vào máy chủ để copy file tĩnh hay chạy `npm run build` trên EC2.

**Các điểm có thể cải thiện tiếp:** loại bỏ workflow GitHub Pages nếu đã ngừng sử dụng; tách CI test khỏi CD; health check sâu hơn; blue/green để giảm downtime; giữ lịch sử release/rollback theo SHA; giám sát dung lượng ổ đĩa, RAM, TLS renewal và uptime; cân nhắc giới hạn quyền SSH deploy.

---

*Tài liệu này mô tả cấu hình tại thời điểm thiết lập. Khi thay đổi workflow, domain, cổng, cấu hình Nginx hoặc cách quản lý secret, cần cập nhật tài liệu tương ứng.*
