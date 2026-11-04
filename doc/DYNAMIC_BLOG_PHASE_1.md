# Dynamic blog — Phase 1: SQLite read-only API

This phase creates a small FastAPI + SQLite backend without changing the live React site or its deployment workflow. Code is isolated on branch `feature/dynamic-blog-api`.

## Why read-only first?

Publishing, editing, deleting, and image uploads require authentication, authorization, validation, and backups. Exposing unauthenticated write endpoints would be unsafe. This phase implements the database schema and public read endpoints only.

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/posts
```

On Windows, activate with `.venv\\Scripts\\activate`. API documentation: `http://127.0.0.1:8000/docs`.

Initial database is empty, so `/api/posts` returns an empty list. The existing React demo posts are intentionally unchanged.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | SQLite connectivity check |
| GET | `/api/posts?limit=20&offset=0` | Published posts only |
| GET | `/api/posts/{slug}` | One published post, 404 otherwise |

Drafts and future-dated posts are not exposed. SQLite uses WAL and an index for published-post queries. All SQL inputs use parameters.

## Data and deployment precautions

- Database file: `BLOG_DB_PATH` (default `./data/blog.db` when run locally).
- Docker image uses `/data/blog.db`; **mount a persistent host directory or volume to `/data`** before production use.
- Never store the database in Git or rely on a container's ephemeral filesystem.
- Do not publish the API to the Internet before configuring reverse proxy, CORS (if necessary), rate limiting, admin authentication, and backups.
- Avoid backing up a live SQLite database with a simple file copy in WAL mode; use SQLite backup API, `VACUUM INTO`, or an application-consistent snapshot.

## Next phase

Add admin authentication (hashed password or managed identity), authenticated CRUD endpoints, post validation, safe Markdown rendering, migration management, automated tests, and backup/restore verification. Only then integrate the React frontend and deploy the backend. Keep EC2 t3.micro resource usage under observation.
