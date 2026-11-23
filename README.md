# Khoảnh khắc ✦ — Photo Gallery (CSR + Express + SeaweedFS)

Ứng dụng Photo Gallery theo đề bài *Upload, xử lý, lưu trữ và phân phối ảnh* (MSc. Ngô Ngọc Đăng Khoa), kèm phần **Bonus chỉnh sửa ảnh** và các tính năng xã hội (bạn bè, react, bình luận).

- **Client (CSR):** React + Vite + framer-motion. Router tự viết bằng History API.
- **Server:** Node 20+/Express, `sharp` (xử lý ảnh), `better-sqlite3` (metadata), `busboy` (multipart).
- **Lưu trữ:** **SeaweedFS** qua S3 API (`STORAGE_DRIVER=seaweedfs`). Có thêm driver `local` để dev/test.
- **Đăng nhập:** Google Identity Services, server xác minh ID token (`google-auth-library`).

## Chạy nhanh

```bash
npm run install:all
# 1) SeaweedFS (S3 :8333)
docker compose up seaweedfs -d           # hoặc: weed server -dir=./data/weed -s3 -s3.config=seaweed/s3.json
# 2) Cấu hình
cp .env.example server/.env              # điền GOOGLE_CLIENT_ID (hoặc đặt AUTH_DEV=1 để thử nhanh)
# 3) Dev (2 terminal)
npm run dev:server                       # http://localhost:4000 (API + /media)
npm run dev:client                       # http://localhost:5173 (proxy /api, /media)
```
Production: `npm run build && npm start` → server phục vụ luôn bản build ở `http://localhost:4000`. Hoặc `docker compose up --build`.

> Server tự nạp `server/.env` nếu có (Node ≥ 22.9).

### Đăng nhập Google
1. Google Cloud Console → *APIs & Services → Credentials → Create OAuth client ID → Web application*.
2. *Authorized JavaScript origins*: `http://localhost:4000` và `http://localhost:5173`.
3. Đặt `GOOGLE_CLIENT_ID`. Client lấy ID này từ `/api/config`, không cần biến `VITE_*`.

`AUTH_DEV=1` chỉ dành cho dev: cho đăng nhập bằng email bất kỳ, **không bao giờ bật khi triển khai thật**.

## Các trang & hành vi chính
| Trang | Nội dung |
|---|---|
| **Home** | Khung giữa: *Chụp ngay* (camera, chọn tỉ lệ, hẹn giờ, chụp xong đăng liền) hoặc *Tải ảnh lên* (chọn/kéo thả 1–5 ảnh, đặt tiêu đề + alt, cắt tỉ lệ). Chưa đăng nhập thì hiện cửa sổ đăng nhập Google trước. |
| **Bạn bè (feed)** | Ảnh mới nhất của bạn bè, cuộn vô hạn; bấm avatar để mở album của họ (mở đúng trang chứa ảnh đăng gần nhất); thả cảm xúc, bình luận. |
| **Album** | Cuốn album 2 trang (1 trang trên điện thoại), mỗi trang 6 khe 3:4. Bấm ảnh để xem/sửa/xóa/tải về; **giữ và kéo** ảnh sang ô khác (kéo sát mép để lật trang; ô có ảnh thì hoán đổi). |
| **Cá nhân** | Đổi avatar (crop vuông), đổi tên, kết bạn bằng Gmail, nhận/từ chối lời mời, đăng xuất. |

Chuyển trang dùng **một khung duy nhất đổi kích thước bằng spring** (morph), nền và bong bóng/đèn dây giữ nguyên xuyên suốt.

### Tỉ lệ ảnh
Chỉ chấp nhận **1:1, 4:3, 3:4** (sai số 2%). Ảnh sai tỉ lệ được client tự cắt giữa về tỉ lệ gần nhất (chỉnh lại được); server vẫn kiểm tra và từ chối `aspect_not_allowed`.
Trong khe album (luôn 3:4): 3:4 phủ kín · **1:1 giữ nguyên, đặt giữa ô** · **4:3 xoay 90° để phủ kín**, mở ra thì xoay về 4:3 như bản gốc (hiệu ứng morph có xoay).

## Giới hạn đã công bố (slide 12)
| Giới hạn | Giá trị | Kết quả khi vượt |
|---|---|---|
| Số file / request | 1–5 | `400 too_many_files`, không ảnh nào được công bố |
| Mỗi file | 10 MiB | file đó `file_too_large`, file khác vẫn lưu |
| Tổng request | 55 MiB | `413 request_too_large` (kiểm `Content-Length` và đếm bytes khi stream) |
| Số pixel | 40 triệu | `too_many_pixels`, kiểm bằng BigInt **trước** khi giải mã |
| Bản gốc lưu trữ | cạnh dài ≤ 4096 px | thu nhỏ khi chuẩn hóa |

Quy trình mỗi file: chữ ký JPEG/PNG → giới hạn pixel → giải mã (từ chối file hỏng/thiếu byte) → **xoay theo EXIF rồi mới bỏ EXIF** → crop/xoay/lật/filter → sinh variant WebP **320 / 960 / 1600 px** (không phóng lớn, không trùng chiều rộng; ví dụ nguồn 800 px → 320 và 800).
Response upload trả kết quả **theo từng file** kèm `index` (200 nếu có ít nhất 1 ảnh lưu được, 422 nếu tất cả lỗi, 4xx cho lỗi cấp request).

## Dữ liệu & lưu trữ
- **DB (SQLite):** `photos`, `photo_variants` (chỉ **storage key**, không có bytes hay đường dẫn tuyệt đối), `users`, `friend_requests`, `reactions`, `comments`, `cleanup_queue`.
- **Kho file (SeaweedFS bucket `gallery`):** `photos/<photoId>/original.webp` (bản gốc chuẩn hóa, **không công khai**), `photos/<photoId>/v<N>/<width>.webp`, `avatars/<userId>/<ts>.webp`.
- **Luồng ghi:** kiểm tra → xử lý → ghi đủ file → ghi metadata trong transaction → commit → trả thành công.
- **Lỗi giữa chừng:** file đã ghi bị xóa bù; nếu xóa bù cũng lỗi thì key được ghi vào `cleanup_queue` và worker (chạy lúc khởi động và mỗi 60 s) dọn lại. Không tự chuyển sang storage khác.
- **Xóa ảnh:** `status='deleting'` (ẩn khỏi gallery) → xóa mọi file → xóa metadata. Chạy lại được; nếu kho lỗi, bản ghi `deleting` được worker xử lý tiếp.
- **Phân phối:** `/media/<key>` trả `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`. URL chứa photoId ngẫu nhiên + version nên nội dung không đổi. *Đánh đổi:* URL ảnh là “capability URL” (ai có link thì xem được); quyền xem danh sách/album vẫn do API kiểm tra theo quan hệ bạn bè.
- **Responsive:** mọi `<img>` có `srcset` (chiều rộng thực từng file), `sizes`, `width`/`height`, `loading`, `alt` (alt do người dùng nhập; nếu trống dùng tiêu đề).

## Bonus: chỉnh sửa ảnh
Crop (khóa 1:1/4:3/3:4), xoay 90°, lật ngang, 7 filter, khôi phục, tải về (JPEG).
- Luôn chỉnh từ **bản gốc đã chuẩn hóa**, không từ variant đã nén. Client gửi **đầy đủ trạng thái** `{rotate, flip, filter, crop}` + `baseVersion`.
- Thứ tự áp dụng: **xoay → lật → crop → filter**. `crop` là **phân số 0..1** của ảnh sau xoay/lật (client không cần biết kích thước bản gốc; server quy đổi ra pixel và từ chối vùng ngoài ảnh).
- Mỗi lần lưu tạo **version mới** `photos/<id>/v<N>/…` (không ghi đè v cũ); `current_version` chỉ đổi trong transaction với điều kiện `current_version = baseVersion` (sửa đồng thời → `409`). File version cũ xóa sau **1 giờ** (`OLD_VERSION_TTL_MS`) qua `cleanup_queue`.
- **Khôi phục** bỏ qua mọi thông số trong request, sinh lại từ bản gốc theo thông số lúc upload (nếu lúc upload phải crop cho đúng tỉ lệ thì crop đó được giữ).
- Filter xem trước bằng CSS còn bản lưu do `sharp` render nên màu có thể lệch nhẹ.

## API
`GET /api/config` · `POST /api/auth/google|dev|logout` · `GET/PATCH /api/me` · `POST/DELETE /api/me/avatar` · `GET /api/friends` · `POST /api/friends/request` · `POST /api/friends/requests/:id/accept` · `DELETE /api/friends/requests/:id` · `DELETE /api/friends/:userId` · `POST /api/photos` (multipart: `photos` ×1–5, `title`/`alt`, `meta` = JSON mảng `{title, alt, edit:{crop}}`) · `GET /api/photos/mine` · `GET /api/feed` · `GET /api/albums/:userId|me` · `GET/PATCH/DELETE /api/photos/:id` · `POST /api/photos/:id/edit` · `POST /api/photos/reorder` · `GET /api/photos/:id/original|download` · `PUT /api/photos/:id/reaction` · `GET/POST /api/photos/:id/comments` · `DELETE /api/comments/:id`.
Mọi request ghi cần header `X-Requested-With: gallery` (chống CSRF, cookie `SameSite=Lax`).

## Kiểm thử & bằng chứng nghiệm thu
```bash
npm run testdata                  # sinh test-data/: JPEG, PNG, EXIF orientation 6 + GPS giả (10.0, 106.0),
                                  # file text đổi đuôi, ảnh thiếu byte, ảnh 49 MP (nhỏ về dung lượng), ảnh > 10 MiB, ảnh 16:9
npm test                          # 12 ca e2e: upload, trộn file giả, 413, EXIF, lỗi DB sau khi ghi file, chỉnh sửa/version/khôi phục, xóa, bạn bè...
TEST_STORAGE=seaweedfs S3_ENDPOINT=http://localhost:8333 S3_ACCESS_KEY=gallery-dev-key S3_SECRET_KEY=gallery-dev-secret npm test   # cùng bộ test trên SeaweedFS thật
npm --prefix client run smoke     # mount toàn bộ UI bằng jsdom, đi qua 4 trang + viewer + editor
```
Gây lỗi có chủ đích (cần `DEBUG_FAULTS=1`): `POST /api/photos?fail=db` hoặc `?fail=storage`, rồi đối chiếu kho: `aws --endpoint-url http://localhost:8333 s3 ls s3://gallery --recursive` (hoặc `weed shell` → `fs.ls`). Kiểm EXIF: `exiftool` trên file tải từ `/media/...`.
Mỗi ảnh có cùng `photoId` ở response, hàng DB (`sqlite3 server/data/gallery.db "select * from photo_variants"`) và key trong bucket.
`DEBUG_FAULTS` và `AUTH_DEV` phải **tắt** khi triển khai.

## Ghi chú
- Chưa có rate limit/quota; thêm khi triển khai công khai.
- Mật khẩu/khóa thật không nằm trong repo; `seaweed/s3.json` chỉ chứa khóa mẫu cho dev.
