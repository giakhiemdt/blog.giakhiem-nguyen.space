"""Read-only blog API. Administrative writes are deliberately not exposed yet."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query

DATABASE_PATH = Path(os.environ.get("BLOG_DB_PATH", "./data/blog.db"))
app = FastAPI(title="Gia Khiem Blog API", version="0.1.0")


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
