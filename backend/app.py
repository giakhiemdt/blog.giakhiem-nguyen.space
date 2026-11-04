"""Single-author blog API: public reads and authenticated admin writes."""
import os
import re
import secrets
import io
import uuid
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field, field_validator

DATABASE_PATH = Path(os.environ.get("BLOG_DB_PATH", "./data/blog.db"))
app = FastAPI(title="Gia Khiem Blog API", version="0.2.0", docs_url=None, redoc_url=None)
basic = HTTPBasic()
ADMIN_USER = os.environ.get("BLOG_ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("BLOG_ADMIN_PASSWORD", "")
S3_BUCKET = os.environ.get("BLOG_S3_BUCKET", "")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp"), "GIF": ("image/gif", "gif")}



def require_admin(credentials: HTTPBasicCredentials = Depends(basic)):
    if not ADMIN_USER or not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="Admin access is not configured")
    if not (secrets.compare_digest(credentials.username.encode(), ADMIN_USER.encode())
            and secrets.compare_digest(credentials.password.encode(), ADMIN_PASSWORD.encode())):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


class PostInput(BaseModel):
    slug: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=100000)
    category: str = Field(default="Notes", min_length=1, max_length=80)
    status: str = "draft"
    cover_image_url: str | None = Field(default=None, max_length=2048)

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, value: str):
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise ValueError("Use lowercase letters, numbers and hyphens")
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str):
        if value not in ("draft", "published"):
            raise ValueError("status must be draft or published")
        return value

    @field_validator("cover_image_url")
    @classmethod
    def valid_image_url(cls, value: str | None):
        if value is not None and not (value.startswith("https://") or (value.startswith("/assets/") or re.fullmatch(r"/api/media/[0-9a-f]{32}\\.(?:jpg|png|webp|gif)", value))):
            raise ValueError("cover_image_url must be HTTPS or a local /assets/ path")
        return value



@contextmanager
def connection():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def initialize_database():
    with connection() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=10000")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'Notes',
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published')),
                cover_image_url TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                published_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_posts_public
                ON posts(status, published_at DESC, id DESC);
        """)
        db.commit()


@app.get("/api/health")
def health():
    with connection() as db:
        db.execute("SELECT 1").fetchone()
    return {"status": "ok"}


@app.get("/api/posts")
def list_posts(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    with connection() as db:
        rows = db.execute("""
            SELECT id, slug, title, summary, category, cover_image_url, published_at
            FROM posts
            WHERE status = 'published' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            ORDER BY published_at DESC, id DESC
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        total = db.execute("""
            SELECT COUNT(*) FROM posts
            WHERE status = 'published' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """).fetchone()[0]
    return {"items": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}


@app.get("/api/posts/{slug}")
def get_post(slug: str):
    with connection() as db:
        row = db.execute("""
            SELECT id, slug, title, summary, content, category, cover_image_url, published_at
            FROM posts
            WHERE slug = ? AND status = 'published'
              AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """, (slug,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return dict(row)


@app.get("/api/admin/posts", dependencies=[Depends(require_admin)])
def admin_list_posts():
    with connection() as db:
        rows = db.execute("SELECT * FROM posts ORDER BY updated_at DESC, id DESC").fetchall()
    return {"items": [dict(row) for row in rows]}


@app.get("/api/admin/me", dependencies=[Depends(require_admin)])
def admin_me():
    return {"role": "admin"}


@app.post("/api/admin/posts", status_code=201, dependencies=[Depends(require_admin)])
def create_post(post: PostInput):
    published_at = None
    if post.status == "published":
        with connection() as db:
            published_at = db.execute("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").fetchone()[0]
    try:
        with connection() as db:
            cur = db.execute("""
                INSERT INTO posts(slug, title, summary, content, category, status,
                                  cover_image_url, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (post.slug, post.title, post.summary, post.content, post.category,
                  post.status, post.cover_image_url, published_at))
            db.commit()
            post_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Slug already exists")
    return {"id": post_id, "slug": post.slug}


@app.put("/api/admin/posts/{post_id}", dependencies=[Depends(require_admin)])
def update_post(post_id: int, post: PostInput):
    try:
        with connection() as db:
            existing = db.execute("SELECT status, published_at FROM posts WHERE id=?", (post_id,)).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Post not found")
            published_at = existing["published_at"]
            if post.status == "draft":
                published_at = None
            elif published_at is None:
                published_at = db.execute("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").fetchone()[0]
            db.execute("""
                UPDATE posts SET slug=?, title=?, summary=?, content=?, category=?,
                                 status=?, cover_image_url=?, published_at=?,
                                 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id=?
            """, (post.slug, post.title, post.summary, post.content, post.category,
                  post.status, post.cover_image_url, published_at, post_id))
            db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Slug already exists")
    return {"id": post_id, "slug": post.slug}


@app.delete("/api/admin/posts/{post_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_post(post_id: int):
    with connection() as db:
        cur = db.execute("DELETE FROM posts WHERE id=?", (post_id,))
        db.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found")


def s3_client():
    if not S3_BUCKET:
        raise HTTPException(status_code=503, detail="Image storage is not configured")
    return boto3.client("s3")


@app.post("/api/admin/images", status_code=201, dependencies=[Depends(require_admin)])
async def upload_image(file: UploadFile = File(...)):
    """Small single-author uploads: private S3 object, served via the public media endpoint."""
    raw = await file.read(MAX_IMAGE_BYTES + 1)
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 5 MiB limit")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            fmt = image.format
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=415, detail="Invalid image")
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, WebP and GIF are supported")
    mime, ext = ALLOWED_FORMATS[fmt]
    key = f"images/{uuid.uuid4().hex}.{ext}"
    try:
        s3_client().put_object(Bucket=S3_BUCKET, Key=key, Body=raw, ContentType=mime,
                               CacheControl="public, max-age=31536000, immutable",
                               ServerSideEncryption="AES256")
    except (BotoCoreError, ClientError):
        raise HTTPException(status_code=502, detail="Image storage unavailable")
    return {"url": "/api/media/" + key.removeprefix("images/"), "size": len(raw)}


@app.get("/api/media/{filename}")
def get_image(filename: str):
    if not re.fullmatch(r"[0-9a-f]{32}\\.(?:jpg|png|webp|gif)", filename):
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        obj = s3_client().get_object(Bucket=S3_BUCKET, Key="images/" + filename)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("NoSuchKey", "404"):
            raise HTTPException(status_code=404, detail="Image not found")
        raise HTTPException(status_code=502, detail="Image storage unavailable")
    except BotoCoreError:
        raise HTTPException(status_code=502, detail="Image storage unavailable")

    def chunks():
        body = obj["Body"]
        try:
            for chunk in body.iter_chunks(chunk_size=65536):
                if chunk:
                    yield chunk
        finally:
            body.close()

    return StreamingResponse(chunks(), media_type=obj["ContentType"],
                             headers={"Cache-Control": "public, max-age=86400",
                                      "X-Content-Type-Options": "nosniff"})
