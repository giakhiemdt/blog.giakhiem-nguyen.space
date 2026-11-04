# Deploy blog API to existing EC2 (Sydney)

**Not yet deployed.** Run the steps on the EC2 host after review. The live frontend Docker container remains on `127.0.0.1:8080`. Backend will listen on `127.0.0.1:8001` and use persistent SQLite on EBS.

## Prerequisites

- EC2 IAM role can `s3:GetObject` and `s3:PutObject` on `arn:aws:s3:::giakhiem-blog-media-2026/images/*`.
- S3 bucket `giakhiem-blog-media-2026` in `ap-southeast-2`.
- Docker installed, disk space and available RAM checked.
- Existing host Nginx configuration backed up.
- **Do not place admin password in GitHub, shell history or public workflow logs.** Use a restricted environment file on EC2.

## Backend build

From repository checkout on EC2 (or build an image in CI and pull it):

```bash
git switch feature/dynamic-blog-api
docker build -t giakhiem-blog-api:local ./backend
```

Create `/opt/giakhiem-blog/blog-api.env` owned by root, mode 600, with:

```ini
BLOG_ADMIN_USER=admin
BLOG_ADMIN_PASSWORD=REPLACE_WITH_LONG_RANDOM_PASSWORD
BLOG_S3_BUCKET=giakhiem-blog-media-2026
AWS_DEFAULT_REGION=ap-southeast-2
```

For safer deployment without exporting password into a shell, use the following Docker run command directly. **Do not use the example deploy script if you prefer environment files**, since that script expects exported variables.

```bash
sudo mkdir -p /opt/giakhiem-blog/data
sudo chown 10001:10001 /opt/giakhiem-blog/data
sudo chmod 700 /opt/giakhiem-blog/data
sudo chmod 600 /opt/giakhiem-blog/blog-api.env

docker run -d --name blog-api --restart unless-stopped \
  --memory 256m --cpus 0.75 \
  -p 127.0.0.1:8001:8000 \
  -v /opt/giakhiem-blog/data:/data \
  --env-file /opt/giakhiem-blog/blog-api.env \
  giakhiem-blog-api:local

curl -fsS http://127.0.0.1:8001/api/health
```

Do not use both deployment methods at once. The sample `backend/deploy-ec2.sh` offers a candidate health check and rollback but requires env vars in the calling process.

## Nginx host reverse proxy

In the existing HTTPS virtual host, add a location **before** the catch-all `location /`:

```nginx
client_max_body_size 6m;

location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
}
```

Keep the existing `location /` pointing to the frontend container on port 8080. Review rate limiting for `/api/admin/` before exposing it publicly. **Do not overwrite your host Nginx config blindly.** Test `sudo nginx -t` before reloading with `sudo systemctl reload nginx`.

The `nginx.conf` inside the frontend image is **not** the host reverse proxy config; editing only that file will not make the backend available from the public domain.

## Security and validation

- HTTPS required for HTTP Basic credentials.
- Confirm unauthenticated `GET /api/posts` works and unauthenticated `POST /api/admin/images` returns 401.
- Confirm an authenticated image upload and media GET.
- Test that draft posts are not visible in public.
- Check container's access to EC2 instance role credentials. If Docker cannot reach IMDSv2, review the instance metadata hop limit and network isolation; do not add AWS static access keys.
- S3 images currently stream through FastAPI. This is simple but consumes EC2 bandwidth and CPU.
- Plan SQLite online backup using Python's `sqlite3.Connection.backup`, store off-instance, and test restore.
- Production frontend and backend CI/CD are not yet unified; do not merge until tested.
