# Gia Khiêm — Blog cá nhân

Blog cá nhân của Gia Khiêm, xây dựng bằng React, TypeScript và Vite. Một không gian để chia sẻ chuyện thường ngày, công nghệ, ghi chép từ sách và những chuyến đi.

Giao diện tông kem/cam với minh họa cửa sổ buổi sáng, trình soạn thảo code, sổ tay và phong cảnh. Hỗ trợ bố cục responsive, tìm kiếm tiếng Việt không dấu, lọc chủ đề và mở bài viết để đọc. Các bài hiện tại là nội dung mẫu.

## Chạy trên máy

Yêu cầu Node.js 22 và npm.

```bash
npm install
npm run dev
```

Build và xem bản production:

```bash
npm run build
npm run preview
```

## Đưa lên GitHub Pages

1. Push toàn bộ mã nguồn và `package-lock.json` lên nhánh `main` hoặc `master` của repo GitHub.
2. Trong repo, mở **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
3. Mở tab **Actions**, chạy workflow **Deploy to GitHub Pages** bằng **Run workflow**, hoặc push thêm một commit. Workflow sẽ build và deploy thư mục `dist`.
4. Xem URL được trả về ở job `deploy`. Với repo hiện tại, URL mặc định là `https://giakhiemdt.github.io/blog.giakhiem-nguyen.space/`.

Nếu dùng nhánh khác, sửa danh sách `branches` trong `.github/workflows/deploy.yml`. Vite dùng `base: './'` để tài nguyên hoạt động trên đường dẫn repo và tên miền riêng. Tên repo có dấu chấm không tự cấu hình custom domain; nếu cần, thiết lập riêng ở Settings → Pages.

## Chỉnh nội dung

- `src/App.tsx`: danh sách `articles` (tiêu đề, chủ đề, mô tả, nội dung và minh họa), bộ lọc `categories`, tên, giới thiệu và liên kết GitHub.
- Khi thêm chủ đề mới vào bài viết, thêm tên tương ứng vào `categories` để hiển thị trong bộ lọc.
- Minh họa có sẵn: `window`, `code`, `notebook`, `sun`; chọn bằng trường `art` của bài viết.
- `src/style.css`: màu sắc, font chữ và bố cục.
- `index.html`: tiêu đề, mô tả SEO.

Không cần backend. Minh họa được dựng bằng CSS/SVG trong mã nguồn. Font Google Fonts có font hệ thống dự phòng. Nội dung bài mẫu chỉ để minh họa và cần thay bằng bài của anh trước khi xuất bản.
