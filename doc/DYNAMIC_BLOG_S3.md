# S3 image storage — Phase 3

Status: code committed on `feature/dynamic-blog-api`, **not deployed**.

## Architecture

Admin browser -> `POST /api/admin/images` (HTTP Basic, HTTPS only) -> FastAPI validates image -> private S3 bucket. The API returns `/api/media/<random-id>.<ext>`; browsers load images through FastAPI, which streams objects from S3. No public S3 ACL or bucket policy is required.

SQLite remains the post database. Only cover images are uploaded through the UI so far. Do not upload sensitive photos: the media URL is publicly accessible if known.

## AWS setup (manual, no resources have been created)

1. Create an S3 bucket in the **same AWS Region as EC2**, with **Block all public access ON**. Use a globally unique bucket name. Leave static website hosting disabled.
2. Enable bucket default encryption (SSE-S3). Consider Versioning if accidental overwrites/deletes matter, but monitor storage costs.
3. Attach the following minimal IAM policy to an **EC2 instance role**, replacing `YOUR_BUCKET_NAME`. Avoid long-lived AWS access keys:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BlogImagesOnly",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/images/*"
    }
  ]
}
```

4. Configure backend environment variable `BLOG_S3_BUCKET=YOUR_BUCKET_NAME`. Boto3 uses the instance role credential provider automatically. Keep `BLOG_ADMIN_USER` and `BLOG_ADMIN_PASSWORD` secret.
5. Ensure EC2 outbound HTTPS can reach S3; this app uses the regional AWS S3 endpoint via boto3.
6. Configure Nginx proxy for `/api/` to backend bound on `127.0.0.1`. Use HTTPS and rate-limit admin endpoints. Ensure Nginx `client_max_body_size` is at least 6m for multipart uploads.
7. Verify authenticated upload and unauthenticated media GET. Test that unauthenticated upload returns 401 and invalid image/oversized image is rejected.
8. Set up SQLite backups separately. S3 images do not replace database backups.

## Upload behavior

- Endpoint: `POST /api/admin/images` with multipart field `file`.
- Accepted: verified JPEG, PNG, WebP, GIF, up to 5 MiB.
- S3 key: `images/<32-character-random-hex>.<extension>`.
- S3 object is private, encrypted SSE-S3, and read through `GET /api/media/{filename}`.
- UI places returned media path into `cover_image_url` field. **Save the post after uploading** to persist the reference.
- Uploading an image but not saving the post leaves an unreferenced object. There is no cleanup task yet.
- This phase does not implement inline article images, image transformations, or S3 backup uploads.

## Operational caveats

- Streaming every image through EC2 consumes bandwidth and EC2 capacity. For a small personal blog this keeps setup simple; if traffic grows, prefer CloudFront with private S3 origin and Origin Access Control.
- A file passing Pillow's `verify()` is not a guarantee that all image metadata is safe. Consider stripping metadata and re-encoding images in a future iteration.
- Do not merge this branch until frontend build, backend tests, Nginx routing, backend deployment and IAM are verified.
