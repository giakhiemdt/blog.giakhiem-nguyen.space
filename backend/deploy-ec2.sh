#!/usr/bin/env bash
set -euo pipefail
# Run on EC2 after setting BLOG_ADMIN_USER, BLOG_ADMIN_PASSWORD and IAM role.
IMAGE="${1:?Usage: deploy-backend.sh <backend-image>}"
: "${BLOG_ADMIN_USER:?Set BLOG_ADMIN_USER}"
: "${BLOG_ADMIN_PASSWORD:?Set BLOG_ADMIN_PASSWORD}"
BUCKET="${BLOG_S3_BUCKET:-giakhiem-blog-media-2026}"
REGION="${AWS_DEFAULT_REGION:-ap-southeast-2}"
DATA_DIR="${BLOG_DATA_DIR:-/opt/giakhiem-blog/data}"
mkdir -p "$DATA_DIR"
# Backend container runs as UID 10001. This must be writable by that UID.
sudo chown -R 10001:10001 "$DATA_DIR"
sudo chmod 700 "$DATA_DIR"
docker pull "$IMAGE"
docker rm -f blog-api-candidate >/dev/null 2>&1 || true
docker run -d --name blog-api-candidate --restart no \
  --memory 256m --cpus 0.75 \
  -p 127.0.0.1:8002:8000 \
  -v "$DATA_DIR:/data" \
  -e BLOG_ADMIN_USER -e BLOG_ADMIN_PASSWORD \
  -e BLOG_S3_BUCKET="$BUCKET" -e AWS_DEFAULT_REGION="$REGION" \
  "$IMAGE"
cleanup() { docker rm -f blog-api-candidate >/dev/null 2>&1 || true; }
trap cleanup EXIT
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8002/api/health >/dev/null; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:8002/api/health
# Recreate production API only after candidate health succeeds.
docker rm -f blog-api-previous >/dev/null 2>&1 || true
if docker inspect blog-api >/dev/null 2>&1; then
  docker stop blog-api >/dev/null
  docker rename blog-api blog-api-previous
fi
if docker run -d --name blog-api --restart unless-stopped \
  --memory 256m --cpus 0.75 \
  -p 127.0.0.1:8001:8000 \
  -v "$DATA_DIR:/data" \
  -e BLOG_ADMIN_USER -e BLOG_ADMIN_PASSWORD \
  -e BLOG_S3_BUCKET="$BUCKET" -e AWS_DEFAULT_REGION="$REGION" \
  "$IMAGE" && sleep 3 && curl -fsS http://127.0.0.1:8001/api/health; then
  echo "Backend is healthy on localhost:8001"
else
  docker rm -f blog-api >/dev/null 2>&1 || true
  if docker inspect blog-api-previous >/dev/null 2>&1; then
    docker rename blog-api-previous blog-api
    docker start blog-api
  fi
  exit 1
fi
