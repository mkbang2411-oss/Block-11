# Khoảnh khắc ✦ — Photo Gallery (CSR + Express + SeaweedFS)

Ứng dụng Photo Gallery theo đề bài _Upload, xử lý, lưu trữ và phân phối ảnh_ (MSc. Ngô Ngọc Đăng Khoa), kèm phần **Bonus chỉnh sửa ảnh** và các tính năng xã hội (bạn bè, react, bình luận).

- **Client (CSR):** React + Vite + framer-motion. Router tự viết bằng History API.
- **Server:** Node 20+/Express, `sharp` (xử lý ảnh), `better-sqlite3` (metadata), `busboy` (multipart).
- **Lưu trữ:** **SeaweedFS** qua S3 API (`STORAGE_DRIVER=seaweedfs`). Có thêm driver `local` để dev/test.
- **Đăng nhập:** Google Identity Services, server xác minh ID token (`google-auth-library`).

## Yêu cầu môi trường

| Công cụ            | Phiên bản                       | Ghi chú                                                 |
| ------------------ | ------------------------------- | ------------------------------------------------------- |
| Node.js            | **≥ 22.9** (khuyên dùng 22 LTS) | Cần để server tự nạp `server/.env`. Kiểm tra: `node -v` |
| npm                | ≥ 10                            | đi kèm Node                                             |
| Docker Desktop     | tùy chọn                        | chỉ cần nếu chạy SeaweedFS hoặc `docker compose`        |
| SeaweedFS (`weed`) | tùy chọn                        | thay cho Docker; trên Windows là `weed.exe`             |

`sharp` và `better-sqlite3` tải bản dựng sẵn khi `npm install`, nên cần có mạng. Nếu `better-sqlite3` báo lỗi build trên Windows, cài _Visual Studio Build Tools_ (workload "Desktop development with C++") rồi cài lại.

## Cấu trúc thư mục

```
client/   React + Vite (giao diện)         → http://localhost:5173 khi dev
server/   Express + sharp + SQLite (API)   → http://localhost:4000 (API + /media)
seaweed/  s3.example.json: khóa MẪU (có trong git) · s3.json: khóa THẬT của bạn (không commit, xem .gitignore)
```

## Chạy nhanh

Chọn **một** trong ba cách. Cách A là nhanh nhất để xem giao diện, không cần Docker hay Google.

### Cách A — Dev nhẹ nhất (lưu ảnh vào ổ đĩa, đăng nhập thử)

Không cần SeaweedFS, không cần Google Client ID.

```bash
# 1) Cài thư viện cho cả server và client (chạy ở thư mục gốc dự án)
npm install                 # cài concurrently, wait-on (chỉ cần nếu dùng `npm run dev`)
npm run install:all

# 2) Tạo file cấu hình cho server
cp .env.example server/.env          # Windows CMD: copy .env.example server\.env
```

Mở `server/.env` rồi sửa các dòng sau:

```ini
STORAGE_DRIVER=local          # lưu ảnh vào server/data/uploads, không cần SeaweedFS
AUTH_DEV=1                    # bỏ dấu # ở đầu dòng: đăng nhập bằng email bất kỳ
# GOOGLE_CLIENT_ID=...        # có thể để trống/comment khi AUTH_DEV=1
```

Chạy **2 terminal** (đều ở thư mục gốc dự án):

```bash
npm run dev:server            # terminal 1 → API tại http://localhost:4000
npm run dev:client            # terminal 2 → mở http://localhost:5173
```

Vào `http://localhost:5173`, bấm đăng nhập, nhập email bất kỳ (ví dụ `an@gmail.com`). Muốn thử kết bạn thì mở thêm một cửa sổ ẩn danh và đăng nhập email thứ hai.

> Thấy chữ `Cannot GET /` ở cổng 4000 là bình thường khi dev: giao diện nằm ở cổng **5173**, cổng 4000 chỉ là API.

### Cách B — Dev đầy đủ với SeaweedFS (đúng như đề bài)

```bash
npm run install:all
cp .env.example server/.env   # giữ STORAGE_DRIVER=seaweedfs; điền GOOGLE_CLIENT_ID hoặc đặt AUTH_DEV=1
cp seaweed/s3.example.json seaweed/s3.json   # rồi thay khóa mẫu bằng khóa ngẫu nhiên (xem mục "Tạo khóa" bên dưới)

# Khởi động SeaweedFS (S3 tại :8333) — chọn một:
docker compose up seaweedfs -d
#   hoặc: weed server -dir=./data/weed -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3 -s3.config=seaweed/s3.json

# Tạo bucket MỘT LẦN bằng tài khoản admin (tài khoản app không có quyền này):
npm run init:bucket

npm run dev:server            # terminal 1
npm run dev:client            # terminal 2 → http://localhost:5173
```

Trên Windows có thể chạy gộp cả ba tiến trình bằng `npm run dev` (script `dev:weed` gọi `weed.exe` ghi dữ liệu vào `C:/weed-data`; sửa đường dẫn trong `package.json` nếu cần). Cần chạy `npm install` ở thư mục gốc một lần để có `cross-env`, `concurrently`, `wait-on`. Script tự chờ cổng 8333 sẵn sàng, tạo bucket (`init:bucket`) rồi mới khởi động server, nên **không cần** chạy `init:bucket` riêng và đừng chạy khi `weed.exe` chưa bật. Khóa admin để tạo bucket đặt trong `server/.env` (`ADMIN_ACCESS_KEY` / `ADMIN_SECRET_KEY`), có thể xóa đi sau khi bucket đã tạo.

**Phân quyền S3 (`seaweed/s3.json`)** — mỗi tài khoản chỉ có quyền vừa đủ:

| Tài khoản | Khóa mẫu (dev)                         | Quyền                                         | Dùng để                                                                                            |
| --------- | -------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `app`     | `app-dev-key` / `app-dev-secret`       | `Read`, `Write`, `List` trên bucket `gallery` | Server ứng dụng (đặt trong `server/.env`). Không tạo/xóa được bucket, không đụng được bucket khác. |
| `viewer`  | `viewer-dev-key` / `viewer-dev-secret` | `Read`, `List` trên bucket `gallery`          | Người chỉ được xem (thầy, người kiểm tra). Không ghi/xóa được.                                     |
| `admin`   | `admin-dev-key` / `admin-dev-secret`   | `Admin`                                       | Chỉ dùng khi quản trị, ví dụ `npm run init:bucket`. **Không** đặt vào `.env` của app.              |

Khóa trong `server/.env` (`S3_ACCESS_KEY`/`S3_SECRET_KEY`) phải là khóa của tài khoản `app` trong `seaweed/s3.json`. Nếu `.env` cũ còn `gallery-dev-key` thì đổi sang khóa `app`.

**Tạo khóa thật (bắt buộc khi triển khai):** `seaweed/s3.example.json` chỉ chứa khóa mẫu ai cũng đoán được. Sao thành `seaweed/s3.json` (file này nằm trong `.gitignore`, không bao giờ commit) rồi thay mỗi access key và secret key bằng chuỗi ngẫu nhiên riêng cho từng tài khoản:

```bash
openssl rand -hex 10   # access key (Git Bash / Linux / Mac)
openssl rand -hex 24   # secret key
```

```powershell
-join ((1..10 | % { '{0:x2}' -f (Get-Random -Max 256) }))   # access key (PowerShell)
-join ((1..24 | % { '{0:x2}' -f (Get-Random -Max 256) }))   # secret key
```

Đặt khóa `app` vào `S3_ACCESS_KEY`/`S3_SECRET_KEY` và khóa `admin` vào `ADMIN_ACCESS_KEY`/`ADMIN_SECRET_KEY` trong `server/.env`. Sau khi sửa `s3.json` phải khởi động lại SeaweedFS (nó chỉ đọc file lúc khởi động). Không dán khóa thật vào chat hay gửi file `s3.json` cho người khác.

**Cổng quản trị của SeaweedFS:** master `9333`, volume `8080`, filer `8888` **không có đăng nhập**. Vì vậy lệnh chạy ở trên có `-ip.bind=127.0.0.1` để chỉ máy này truy cập được (đã kiểm thử: các cổng 9333/8080/8888/8333 không còn truy cập được qua IP mạng LAN). Muốn máy khác trong mạng xem được S3 thì chỉ mở riêng S3 bằng `-s3.ip.bind=0.0.0.0` và dùng tài khoản `viewer`. Với Docker Compose, chỉ cổng S3 được mở và chỉ ở `127.0.0.1:8333`.

### Cách C — Chạy bản production bằng Docker

```bash
# (tùy chọn) đặt biến trước khi chạy; Windows PowerShell: $env:AUTH_DEV="1"
export SESSION_SECRET=mot-chuoi-ngau-nhien-dai
export GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com   # hoặc AUTH_DEV=1 để thử
docker compose up --build
```

> Lưu ý: `docker-compose.yml` hiện vẫn ghi cứng khóa mẫu (`admin-dev-key`, `app-dev-key`...) và gắn `seaweed/s3.json` vào container. Muốn chạy Docker với khóa thật thì phải sửa các dòng `environment` trong `docker-compose.yml` cho khớp `s3.json`. Máy mới clone repo cần chạy `cp seaweed/s3.example.json seaweed/s3.json` trước, nếu không Docker sẽ gắn nhầm thành thư mục.

Mở `http://localhost:4000` (server phục vụ luôn bản build của client). Dữ liệu nằm trong volume `seaweed-data` và `app-data`. Service `bucket-init` chạy một lần để tạo bucket bằng tài khoản admin rồi thoát; `app` chỉ khởi động sau khi nó xong. Dừng: `docker compose down` (thêm `-v` nếu muốn xóa sạch dữ liệu).

Không dùng Docker: `npm run build && npm start` rồi mở `http://localhost:4000` (cần đã có `server/.env`).

> Server tự nạp `server/.env` nếu có (Node ≥ 22.9). Sửa `.env` xong phải **khởi động lại** server (`npm run dev:server` tự restart khi sửa code nhưng không đọc lại file `.env` đã đổi trong mọi trường hợp, nên cứ dừng và chạy lại cho chắc).

### Các biến môi trường chính (`server/.env`)

| Biến                                                            | Mặc định            | Ý nghĩa                                       |
| --------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| `PORT`                                                          | `4000`              | Cổng server                                   |
| `SESSION_SECRET`                                                | chuỗi dev           | **Phải đổi** khi triển khai thật              |
| `COOKIE_SECURE`                                                 | `0`                 | Đặt `1` khi chạy sau HTTPS                    |
| `GOOGLE_CLIENT_ID`                                              | trống               | Đăng nhập Google                              |
| `AUTH_DEV`                                                      | trống               | `1` = đăng nhập email bất kỳ (**chỉ dev**)    |
| `STORAGE_DRIVER`                                                | `seaweedfs`         | `seaweedfs` · `s3` · `local`                  |
| `LOCAL_STORAGE_ROOT`                                            | `./data/uploads`    | Thư mục ảnh khi dùng `local`                  |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | xem `.env.example`  | Kết nối S3/SeaweedFS                          |
| `DB_PATH`                                                       | `./data/gallery.db` | File SQLite (tính từ thư mục `server/`)       |
| `OLD_VERSION_TTL_MS`                                            | `3600000`           | Thời gian giữ file version cũ sau khi sửa ảnh |
| `DEBUG_FAULTS`                                                  | trống               | Chỉ khi nghiệm thu, **tắt** khi triển khai    |

### Khi SeaweedFS không chạy hoặc bị sập

| Tình huống                            | Hành vi của server                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Khởi động khi SeaweedFS chưa sẵn sàng | Thử kết nối lại mỗi 2 giây, tối đa 30 lần (~60 giây), log `[storage] chưa kết nối được kho, thử lại n/30...`. Hết lượt mới thoát, kèm thông báo "Không kết nối được SeaweedFS tại ...". |
| Sai khóa (403) hoặc thiếu bucket      | Báo ngay, không thử lại vì thử lại cũng vô ích.                                                                                                                                         |
| Đang chạy thì SeaweedFS sập           | Album và feed vẫn lên (metadata nằm trong SQLite) nhưng ảnh vỡ. Upload báo lỗi, không sinh bản ghi ma. Xóa ảnh được ẩn đi và worker thử lại mỗi 60 giây khi kho sống lại.               |
| Kho treo, không trả lời               | Kết nối quá 5 giây hoặc 30 giây không có dữ liệu thì bỏ, thay vì treo vô hạn.                                                                                                           |
| Tự chuyển sang kho khác               | **Không**, chủ đích để tránh file nằm rải ở hai nơi.                                                                                                                                    |

Kiểm tra nhanh kho còn sống không: `GET /api/health` (không cần đăng nhập). Trả `200 {"ok":true,"storage":"up"}` khi ổn, `503 {"ok":false,"storage":"down"}` khi không kết nối được kho hoặc quá 3 giây không phản hồi. Chi tiết lỗi chỉ ghi vào log server, không trả ra ngoài.

**Chưa có:** trang "đang bảo trì" ở client, versioning/object lock. Hiện chạy một node, không nhân bản: mất thư mục dữ liệu `weed` là mất ảnh, nên hãy sao lưu định kỳ như bên dưới.

### Sao lưu và khôi phục

```bash
npm run backup -- D:/khoanh-khac-backup      # chạy được khi server đang chạy; bỏ đường dẫn thì dùng BACKUP_DIR hoặc ./server/backups
```

- **Nên đặt thư mục sao lưu ở ổ đĩa khác** (hoặc ổ ngoài, thư mục đồng bộ cloud). Sao lưu cùng ổ với `C:/weed-data` không cứu được khi hỏng ổ.
- Mỗi lần chạy: lưu một ảnh chụp SQLite `db/gallery-<thời gian>.db` (nhất quán kể cả khi server đang ghi; giữ 14 bản mới nhất, đổi bằng `BACKUP_KEEP_DB`) và chép các file ảnh **còn chưa có** vào `files/` (đọc qua API của kho nên không chép giữa chừng thư mục của weed). Chạy lại nhiều lần rất nhanh vì chỉ chép file mới.
- `files/` **không bao giờ xóa** file: ảnh lỡ bị xóa khỏi kho vẫn còn ở đây. Đổi lại thư mục này chỉ lớn lên, cần tự dọn khi cần.
- Chạy mỗi ngày bằng **Task Scheduler** (Windows): tạo tác vụ chạy `npm run backup -- D:/khoanh-khac-backup` với thư mục bắt đầu là thư mục dự án.
- Backup dùng khóa của tài khoản `app` trong `server/.env` (chỉ cần quyền đọc/liệt kê).

**Khôi phục** (dừng server trước, bật SeaweedFS và đảm bảo bucket đã có):

```bash
npm run restore -- D:/khoanh-khac-backup                  # DB mới nhất + đẩy lên kho những ảnh còn thiếu
npm run restore -- D:/khoanh-khac-backup --force          # ghi đè DB đang có (DB cũ đổi tên thành .bak)
npm run restore -- D:/khoanh-khac-backup --db gallery-2026-11-23_19-40-00.db   # chọn bản DB cụ thể
```

Nếu mất cả kho: cài lại SeaweedFS, chạy `npm run init:bucket` để tạo bucket, rồi `restore`. Kho là phần ghi đè an toàn (chỉ thêm file chưa có), còn DB cần `--force` nếu đã tồn tại.

### Đăng nhập Google

1. Google Cloud Console → _APIs & Services → Credentials → Create OAuth client ID → Web application_.
2. _Authorized JavaScript origins_: `http://localhost:4000` và `http://localhost:5173`.
3. Đặt `GOOGLE_CLIENT_ID`. Client lấy ID này từ `/api/config`, không cần biến `VITE_*`.

`AUTH_DEV=1` chỉ dành cho dev: cho đăng nhập bằng email bất kỳ, **không bao giờ bật khi triển khai thật**.

### Xử lý sự cố thường gặp

| Triệu chứng                                                                                             | Nguyên nhân / cách xử lý                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node: bad option: --env-file-if-exists`                                                                | Node cũ. Cập nhật lên Node ≥ 22.9.                                                                                                                                                                                                                                                                                                                                                      |
| Giao diện trắng hoặc `[vite] http proxy error ... ECONNREFUSED` ở terminal client                       | Vite luôn chuyển `/api` và `/media` sang **cổng 4000**. Nhìn dòng `[server] http://localhost:XXXX` trong log: nếu **không phải 4000** (ví dụ 3000) thì server đang chạy sai cổng. Đặt `PORT=4000` trong `server/.env`, hoặc xóa biến môi trường `PORT` của hệ thống (Windows: `echo %PORT%`), rồi chạy lại. Nếu chưa thấy dòng `[server]` thì server chưa chạy hoặc đang chờ SeaweedFS. |
| Log `weed` hiện `raft.Server: Not current leader`, `WaitUntilConnected still waiting` lúc mới khởi động | Bình thường: SeaweedFS đang bầu leader, vài giây đến vài chục giây sau sẽ có dòng `becomes leader`. Chỉ lo khi lặp mãi không dừng.                                                                                                                                                                                                                                                      |
| Đăng nhập không có nút Google                                                                           | Chưa đặt `GOOGLE_CLIENT_ID`. Đặt nó hoặc bật `AUTH_DEV=1`, rồi khởi động lại server.                                                                                                                                                                                                                                                                                                    |
| Đăng nhập Google báo lỗi origin                                                                         | Thêm đúng `http://localhost:5173` (dev) hoặc `:4000` (production) vào _Authorized JavaScript origins_.                                                                                                                                                                                                                                                                                  |
| Upload lỗi `internal_error` / không kết nối được S3                                                     | SeaweedFS chưa chạy ở `:8333` (kiểm tra `GET /api/health`), hoặc khóa trong `.env` không phải khóa tài khoản `app` trong `seaweed/s3.json` (báo `AccessDenied`). Hoặc chuyển sang `STORAGE_DRIVER=local`.                                                                                                                                                                               |
| Server thoát với `Bucket "gallery" chưa tồn tại`                                                        | SeaweedFS đã chạy nhưng chưa có bucket: chạy `npm run init:bucket` một lần (dùng tài khoản admin).                                                                                                                                                                                                                                                                                      |
| Server thoát với `Không kết nối được SeaweedFS tại ...`                                                 | `weed.exe` chưa chạy, đã tắt, hoặc sai `S3_ENDPOINT`. Bật SeaweedFS rồi chạy lại (server đã tự chờ ~60 giây trước khi thoát).                                                                                                                                                                                                                                                           |
| `init:bucket` báo `Bị từ chối` hoặc `AggregateError`                                                    | `Bị từ chối`: `ADMIN_ACCESS_KEY`/`ADMIN_SECRET_KEY` trong `server/.env` không khớp tài khoản `admin` trong `seaweed/s3.json` (mặc định script dùng khóa mẫu `admin-dev-*`). `AggregateError`: không kết nối được, `weed.exe` đang tắt.                                                                                                                                                  |
| Cổng 4000/5173/8333 đã bị chiếm                                                                         | Đổi `PORT` trong `.env` (cổng client đổi trong `client/vite.config.js`, và nhớ đổi địa chỉ proxy tương ứng).                                                                                                                                                                                                                                                                            |
| Nền chỉ có màu xanh navy tối, không thấy gradient tím                                                   | Máy đang bật "giảm chuyển động" (Windows: _Accessibility → Visual effects → Animation effects_). Bản hiện tại đã giữ gradient đứng yên ở đoạn có màu tím; bật lại animation để nền chuyển động. Khi giảm chuyển động, trang album đổi trang ngay thay vì lật.                                                                                                                           |
| Muốn xóa sạch dữ liệu dev                                                                               | Dừng server, xóa `server/data/` (DB + ảnh khi dùng `local`). Với SeaweedFS xóa thêm thư mục dữ liệu `weed` hoặc `docker compose down -v`.                                                                                                                                                                                                                                               |

## Các trang & hành vi chính

| Trang             | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home**          | Khung giữa: _Chụp ngay_ (camera, chọn tỉ lệ, hẹn giờ, chụp xong đăng liền) hoặc _Tải ảnh lên_ (chọn/kéo thả 1–5 ảnh, đặt tiêu đề + alt, cắt tỉ lệ). Chưa đăng nhập thì hiện cửa sổ đăng nhập Google trước.                                                                                                                                                                                                                         |
| **Bạn bè (feed)** | Ảnh mới nhất của bạn bè, cuộn vô hạn; bấm avatar để mở album của họ (mở đúng trang chứa ảnh đăng gần nhất); thả cảm xúc, bình luận.                                                                                                                                                                                                                                                                                                |
| **Album**         | Cuốn album 3D nhìn chính diện, 2 trang (1 trang trên điện thoại), mỗi trang 6 ô khung Polaroid (tỉ lệ ô 0.85, chỉnh bằng `RATIO` trong `client/src/pages/Album.jsx`). Rê chuột vào ảnh thì ảnh nổi lên; chuyển trang bằng nút tròn hai bên, thanh phân trang bên dưới hoặc phím ←/→ (trang giấy lật bằng CSS 3D). Bấm ảnh để xem/sửa/xóa/tải về; **giữ và kéo** ảnh sang ô khác (kéo sát mép để lật trang; ô có ảnh thì hoán đổi). |
| **Cá nhân**       | Đổi avatar (crop vuông), đổi tên, kết bạn bằng Gmail, nhận/từ chối lời mời, đăng xuất.                                                                                                                                                                                                                                                                                                                                             |

Chuyển trang dùng **một khung duy nhất đổi kích thước bằng spring** (morph), nền và bong bóng/đèn dây giữ nguyên xuyên suốt.

### Tỉ lệ ảnh

Chỉ chấp nhận **1:1, 4:3, 3:4** (sai số 2%). Ảnh sai tỉ lệ được client tự cắt giữa về tỉ lệ gần nhất (chỉnh lại được); server vẫn kiểm tra và từ chối `aspect_not_allowed`.
Trong ô album (khung Polaroid, tỉ lệ 0.85): 3:4 phủ kín (cắt nhẹ hai bên) · **1:1 giữ nguyên, đặt giữa ô** · **4:3 xoay 90° để phủ kín**, mở ra thì xoay về 4:3 như bản gốc (hiệu ứng morph có xoay).

## Giới hạn đã công bố (slide 12)

| Giới hạn          | Giá trị            | Kết quả khi vượt                                                        |
| ----------------- | ------------------ | ----------------------------------------------------------------------- |
| Số file / request | 1–5                | `400 too_many_files`, không ảnh nào được công bố                        |
| Mỗi file          | 10 MiB             | file đó `file_too_large`, file khác vẫn lưu                             |
| Tổng request      | 55 MiB             | `413 request_too_large` (kiểm `Content-Length` và đếm bytes khi stream) |
| Số pixel          | 40 triệu           | `too_many_pixels`, kiểm bằng BigInt **trước** khi giải mã               |
| Bản gốc lưu trữ   | cạnh dài ≤ 4096 px | thu nhỏ khi chuẩn hóa                                                   |

Quy trình mỗi file: chữ ký JPEG/PNG → giới hạn pixel → giải mã (từ chối file hỏng/thiếu byte) → **xoay theo EXIF rồi mới bỏ EXIF** → crop/xoay/lật/filter → sinh variant WebP **320 / 960 / 1600 px** (không phóng lớn, không trùng chiều rộng; ví dụ nguồn 800 px → 320 và 800).
Response upload trả kết quả **theo từng file** kèm `index` (200 nếu có ít nhất 1 ảnh lưu được, 422 nếu tất cả lỗi, 4xx cho lỗi cấp request).

## Dữ liệu & lưu trữ

- **DB (SQLite):** `photos`, `photo_variants` (chỉ **storage key**, không có bytes hay đường dẫn tuyệt đối), `users`, `friend_requests`, `reactions`, `comments`, `cleanup_queue`.
- **Kho file (SeaweedFS bucket `gallery`):** `photos/<photoId>/original.webp` (bản gốc chuẩn hóa, **không công khai**), `photos/<photoId>/v<N>/<width>.webp`, `avatars/<userId>/<ts>.webp`.
- **Luồng ghi:** kiểm tra → xử lý → ghi đủ file → ghi metadata trong transaction → commit → trả thành công.
- **Lỗi giữa chừng:** file đã ghi bị xóa bù; nếu xóa bù cũng lỗi thì key được ghi vào `cleanup_queue` và worker (chạy lúc khởi động và mỗi 60 s) dọn lại. Không tự chuyển sang storage khác.
- **Xóa ảnh:** `status='deleting'` (ẩn khỏi gallery) → xóa mọi file → xóa metadata. Chạy lại được; nếu kho lỗi, bản ghi `deleting` được worker xử lý tiếp.
- **Phân phối:** `/media/<key>` trả `Content-Type: image/webp` và `Cache-Control: public, max-age=31536000, immutable`. URL chứa photoId ngẫu nhiên + version nên nội dung không đổi. _Đánh đổi:_ URL ảnh là “capability URL” (ai có link thì xem được); quyền xem danh sách/album vẫn do API kiểm tra theo quan hệ bạn bè.
- **Responsive:** mọi `<img>` có `srcset` (chiều rộng thực từng file), `sizes`, `width`/`height`, `loading`, `alt` (alt do người dùng nhập; nếu trống dùng tiêu đề).

## Bonus: chỉnh sửa ảnh

Crop (khóa 1:1/4:3/3:4), xoay 90°, lật ngang, 7 filter, khôi phục, tải về (JPEG).

- Luôn chỉnh từ **bản gốc đã chuẩn hóa**, không từ variant đã nén. Client gửi **đầy đủ trạng thái** `{rotate, flip, filter, crop}` + `baseVersion`.
- Thứ tự áp dụng: **xoay → lật → crop → filter**. `crop` là **phân số 0..1** của ảnh sau xoay/lật (client không cần biết kích thước bản gốc; server quy đổi ra pixel và từ chối vùng ngoài ảnh).
- Mỗi lần lưu tạo **version mới** `photos/<id>/v<N>/…` (không ghi đè v cũ); `current_version` chỉ đổi trong transaction với điều kiện `current_version = baseVersion` (sửa đồng thời → `409`). File version cũ xóa sau **1 giờ** (`OLD_VERSION_TTL_MS`) qua `cleanup_queue`.
- **Khôi phục** bỏ qua mọi thông số trong request, sinh lại từ bản gốc theo thông số lúc upload (nếu lúc upload phải crop cho đúng tỉ lệ thì crop đó được giữ).
- Filter xem trước bằng CSS còn bản lưu do `sharp` render nên màu có thể lệch nhẹ.

## API

`GET /api/health` · `GET /api/config` · `POST /api/auth/google|dev|logout` · `GET/PATCH /api/me` · `POST/DELETE /api/me/avatar` · `GET /api/friends` · `POST /api/friends/request` · `POST /api/friends/requests/:id/accept` · `DELETE /api/friends/requests/:id` · `DELETE /api/friends/:userId` · `POST /api/photos` (multipart: `photos` ×1–5, `title`/`alt`, `meta` = JSON mảng `{title, alt, edit:{crop}}`) · `GET /api/photos/mine` · `GET /api/feed` · `GET /api/albums/:userId|me` · `GET/PATCH/DELETE /api/photos/:id` · `POST /api/photos/:id/edit` · `POST /api/photos/reorder` · `GET /api/photos/:id/original|download` · `PUT /api/photos/:id/reaction` · `GET/POST /api/photos/:id/comments` · `DELETE /api/comments/:id`.
Mọi request ghi cần header `X-Requested-With: gallery` (chống CSRF, cookie `SameSite=Lax`).

## Kiểm thử & bằng chứng nghiệm thu

```bash
npm run testdata                  # sinh test-data/: JPEG, PNG, EXIF orientation 6 + GPS giả (10.0, 106.0),
                                  # file text đổi đuôi, ảnh thiếu byte, ảnh 49 MP (nhỏ về dung lượng), ảnh > 10 MiB, ảnh 16:9
npm test                          # 15 ca e2e: health check, retry khởi động, upload, trộn file giả, 413, EXIF, lỗi DB sau khi ghi file, chỉnh sửa/version/khôi phục, xóa, bạn bè...
npm run init:bucket               # (một lần) tạo bucket bằng tài khoản admin
TEST_STORAGE=seaweedfs S3_ENDPOINT=http://localhost:8333 S3_ACCESS_KEY=app-dev-key S3_SECRET_KEY=app-dev-secret npm test   # cùng bộ test trên SeaweedFS thật, bằng tài khoản app
npm --prefix client run smoke     # mount toàn bộ UI bằng jsdom, đi qua 4 trang + viewer + editor
```

Gây lỗi có chủ đích (cần `DEBUG_FAULTS=1`): `POST /api/photos?fail=db` hoặc `?fail=storage`, rồi đối chiếu kho: `aws --endpoint-url http://localhost:8333 s3 ls s3://gallery --recursive` (hoặc `weed shell` → `fs.ls`). Kiểm EXIF: `exiftool` trên file tải từ `/media/...`.
Mỗi ảnh có cùng `photoId` ở response, hàng DB (`sqlite3 server/data/gallery.db "select * from photo_variants"`) và key trong bucket.
`DEBUG_FAULTS` và `AUTH_DEV` phải **tắt** khi triển khai.

## Ghi chú

- Chưa có rate limit/quota; thêm khi triển khai công khai.
- Mật khẩu/khóa thật không nằm trong repo: `seaweed/s3.json` (khóa thật) và `server/.env` nằm trong `.gitignore`; repo chỉ có `seaweed/s3.example.json` và `.env.example` với khóa mẫu.
- Trên Windows, ca test "tổng request > 55 MiB → 413" chấp nhận cả lỗi `ECONNRESET` vì server đóng kết nối ngay khi từ chối.
