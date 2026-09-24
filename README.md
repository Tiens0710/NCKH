# Outlier Re-ID

Hệ thống tìm kiếm và truy vết một người qua nhiều camera bằng phát hiện người,
tracking, Re-ID embedding và tìm kiếm vector.

## Trạng thái hiện tại

- Supabase project: `wtwjsisqghrqtqhzepci`.
- PostgreSQL/pgvector: đã tạo 8 bảng và hàm `match_tracklets`.
- Storage: đã tạo 5 bucket riêng tư.
- Backend FastAPI: đã có API camera, video, truy vấn và kết quả.
- Frontend Next.js: đã có Dashboard, Camera, Video, Tìm kiếm và Kết quả.
- `render.yaml`: cấu hình hai Web Service độc lập trên Render — Next.js frontend
  và FastAPI backend — dùng hostname private giữa hai service.
- AI Worker: đã có bước phát hiện người bằng RetinaNet chạy riêng trên CPU;
  tracking và Re-ID chưa triển khai. Xem `backend/README.md` để chạy worker.
- Kaggle Notebook: `notebooks/retinanet_kaggle.ipynb` chạy RetinaNet thủ công
  khi cần, có thể dùng GPU của Kaggle. Đây là AI batch worker, không thay thế
  FastAPI đang phục vụ API web.
- Streamlit: đã có bản demo một dịch vụ để triển khai nhanh lên Community Cloud.
- Trang Video của Streamlit có sẵn video mẫu `people-detection.mp4`: có thể xem tự
  động trong trình duyệt hoặc bấm **Dùng video mẫu này cho pipeline AI** để tạo một
  video `pending` trong Supabase, sau đó chạy Kaggle Worker.
- Demo hiện tại: trang Kết quả có kết quả mô phỏng và bản đồ vệ tinh Leafmap để
  trình bày tuyến di chuyển trong Campus II Đại học Cần Thơ; dữ liệu này chỉ nằm
  trên giao diện, không ghi đè kết quả AI trong Supabase.
- Tài liệu nghiên cứu: `index.html` (bản public tại Vercel) và bản sao
  `baibao/boutlier.html` chứa đề cương, kiến trúc 6 lớp và sơ đồ data flow.
  Trang bài báo có thể double-click vào đoạn văn để sửa, thêm/xóa đoạn. Bản
  nháp dùng chung được lưu ở bảng Supabase `article_documents`; `localStorage`
  chỉ còn là cache dự phòng khi API tạm thời không truy cập được.

### Lưu nội dung bài báo trên Supabase

Bảng `public.article_documents` đã được tạo bằng migration
`supabase/migrations/20260924000000_create_article_documents.sql`. Trang public
gọi API serverless `/api/article`, vì vậy khóa quản trị Supabase không đi vào
trình duyệt.

Trong Vercel Project → Settings → Environment Variables, thêm các biến cho
Production (và Preview nếu cần):

```text
SUPABASE_URL=https://wtwjsisqghrqtqhzepci.supabase.co
SUPABASE_SECRET_KEY=<khóa sb_secret mới>
ARTICLE_EDITOR_TOKEN=<một mã chỉnh sửa dài, ngẫu nhiên>
```

Sau khi deploy, mở trang bài báo, nhập `ARTICLE_EDITOR_TOKEN` vào ô **Mã chỉnh
sửa**, bật chỉnh sửa và bấm **Lưu bản nháp**. Nội dung và ghi chú sẽ được
upsert vào Supabase; nút **Khôi phục gốc** sẽ xóa bản nháp database sau khi
xác nhận. Không commit các giá trị thật vào GitHub.

## Chạy và public bản Streamlit

Bản Streamlit gọi Supabase trực tiếp từ phía server, vì vậy không cần public
FastAPI ở giai đoạn demo. Ứng dụng có mật khẩu riêng để tránh mở quyền quản trị
database cho mọi người trên Internet.

Chạy local:

```powershell
Copy-Item .streamlit\secrets.toml.example .streamlit\secrets.toml
# Điền SUPABASE_SECRET_KEY và APP_PASSWORD vào secrets.toml
python -m streamlit run streamlit_app.py
```

Triển khai trên Streamlit Community Cloud:

1. Đẩy mã nguồn lên GitHub; không đẩy `.env` hoặc `.streamlit/secrets.toml`.
2. Tạo app tại `share.streamlit.io`, chọn repo, branch `main` và entrypoint
   `streamlit_app.py`.
3. Trong **Advanced settings → Secrets**, dán nội dung theo mẫu
   `.streamlit/secrets.toml.example` bằng một Supabase secret key mới.
4. Chọn **Deploy**, rồi đăng nhập bằng `APP_PASSWORD` đã đặt.

Khóa từng được gửi qua chat phải được thu hồi/rotate trước khi dùng cho bản
public. Không đưa `SUPABASE_SECRET_KEY` vào source code hoặc biến phía trình duyệt.

### Triển khai Streamlit trên Render

Nếu Streamlit Community Cloud/GitHub OAuth gặp lỗi, có thể dùng Render Web Service
và kết nối bằng **Public Git Repository** URL `https://github.com/Tiens0710/NCKH`.
Hướng này không cần liên kết GitHub OAuth, nhưng phải deploy thủ công khi push mã mới.

- Runtime/Language: Python, branch `main`, plan Free để thử nghiệm.
- Build Command: `pip install -r requirements.txt`
- Start Command: `streamlit run streamlit_app.py --server.address 0.0.0.0 --server.port $PORT --server.headless true`
- Health Check Path: `/_stcore/health`
- Environment Variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_PASSWORD`.

Chỉ lưu giá trị thật trong **Render Dashboard → Environment**, không đưa vào GitHub.
`SUPABASE_SECRET_KEY` cần là khóa mới sau khi xoay; khóa từng chia sẻ qua chat không
được dùng cho bản public. Render Free có thể ngủ sau thời gian không truy cập;
lượt truy cập đầu tiên sau đó sẽ chậm hơn.

### Triển khai Next.js + FastAPI trên Render

Blueprint `render.yaml` đã sẵn sàng cho frontend và backend. Sau khi mã nguồn đã
được push lên GitHub:

1. Mở Render Dashboard → **New → Blueprint** và chọn repository này.
2. Xác nhận hai service `outlier-reid-api` và `outlier-reid-web`.
3. Điền `SUPABASE_SECRET_KEY` trong Environment của `outlier-reid-api`; không
   đưa khóa này vào GitHub hoặc biến `NEXT_PUBLIC_*`.
4. Bấm **Apply**. Frontend gọi `/api/*` cùng origin; Next.js proxy nội bộ tới
   FastAPI nên trình duyệt không cần biết hostname private của backend.

Render Free có thể sleep khi không có truy cập. `render.yaml` đã đặt health check
cho `/health` và build frontend bằng `npm ci && npm run build`.

## Luồng kết nối

```text
Trình duyệt
   │
   │ NEXT_PUBLIC_API_URL (địa chỉ công khai, không phải secret)
   ▼
Next.js frontend ──HTTP──> FastAPI backend
                            │
                            │ SUPABASE_URL + SUPABASE_SECRET_KEY
                            ▼
                    Supabase Database + Storage
```

Frontend không truy cập database bằng quyền quản trị. Chỉ FastAPI giữ khóa
`sb_secret_...` và thực hiện các thao tác cần thiết với Supabase.

## 1. Cấu hình Supabase cho backend

Trong PowerShell tại `D:\NCKH`:

```powershell
Copy-Item .env.example .env
```

Mở `.env` và cấu hình:

```env
SUPABASE_URL=https://wtwjsisqghrqtqhzepci.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxx
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
MAX_UPLOAD_BYTES=50331648
```

Lấy `sb_secret_...` tại **Supabase Dashboard → Project Settings → API Keys**.
Nếu project chỉ có khóa cũ, có thể dùng tạm:

```env
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Chỉ khai báo một trong hai khóa quản trị. Không commit `.env`, không gửi khóa
qua chat và không đặt khóa này trong biến bắt đầu bằng `NEXT_PUBLIC_`.

## 2. Chạy backend

Các dependency Python đã được ghim trong `requirements.txt`.

```powershell
Set-Location D:\NCKH
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload
```

Kiểm tra backend:

- `http://127.0.0.1:8000/health` — kiểm tra FastAPI.
- `http://127.0.0.1:8000/health/supabase` — kiểm tra database thật.
- `http://127.0.0.1:8000/docs` — Swagger để thử API.

Kết nối thành công khi `/health/supabase` trả về:

```json
{"status":"ok","database":"connected"}
```

## 3. Cấu hình và chạy frontend

Mở một cửa sổ PowerShell khác:

```powershell
Set-Location D:\NCKH\frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Nội dung `frontend/.env.local` khi chạy local:

```env
NEXT_PUBLIC_API_URL=
BACKEND_INTERNAL_URL=http://127.0.0.1:8000
```

Mở `http://127.0.0.1:3000`. Badge phía trên sẽ hiển thị:

- **Đã cấu hình Supabase**: FastAPI đã nhận được khóa quản trị.
- **Chưa nối Supabase**: FastAPI chạy nhưng thiếu khóa trong `.env`.
- **API ngoại tuyến**: frontend không gọi được FastAPI.

## 4. API frontend đang sử dụng

| Chức năng | Endpoint FastAPI |
| --- | --- |
| Danh sách camera | `GET /api/cameras` |
| Thêm camera | `POST /api/cameras` |
| Danh sách video | `GET /api/videos` |
| Upload video | `POST /api/videos/upload` |
| Tạo truy vấn từ ảnh | `POST /api/searches` |
| Đối sánh vector 512 chiều | `POST /api/searches/{id}/match` |
| Đọc kết quả và hành trình | `GET /api/searches/{id}` |

## 5. Dữ liệu được lưu ở đâu?

### PostgreSQL

- `cameras`: camera, khu vực, tọa độ, RTSP URL và `metadata` JSONB.
- `videos`: đường dẫn Storage, thời gian, trạng thái và `metadata` JSONB.
- `tracklets`: đoạn xuất hiện của một người và `attributes` JSONB.
- `tracklet_embeddings`: vector Re-ID 512 chiều.
- `search_queries`: ảnh truy vấn, bộ lọc JSONB và vector truy vấn.
- `search_results`: kết quả xếp hạng theo similarity.
- `trajectory_points`: hành trình theo camera và thời gian.

### Supabase Storage

- `raw-videos`: video gốc.
- `person-crops`: ảnh crop người.
- `query-images`: ảnh người cần tìm.
- `campus-maps`: sơ đồ khu vực.
- `raw-detections`: file JSON detection lớn hoặc dữ liệu trung gian.

### Chế độ demo hành trình

Vào **Kết quả** trên Streamlit để xem `DEMO-PERSON-001`, tuyến màu đỏ trên lớp
nền vệ tinh và bảng các mốc thời gian. Tuyến này dùng tọa độ minh họa quanh Campus
II và không đại diện cho vị trí của người thật. RetinaNet hiện chỉ tạo khung
bao người trên từng frame; hành trình thật vẫn cần tracking và Re-ID.

## 6. Kiểm tra nhanh khi có lỗi

### Frontend báo “Chưa nối Supabase”

Kiểm tra có tệp `D:\NCKH\.env` và đã điền `SUPABASE_SECRET_KEY`. Sau đó khởi
động lại FastAPI vì biến môi trường chỉ được đọc khi ứng dụng khởi động.

### Frontend báo “API ngoại tuyến”

Kiểm tra FastAPI đang chạy ở cổng 8000 và `NEXT_PUBLIC_API_URL` trỏ đúng địa chỉ.

### Trình duyệt báo lỗi CORS

Thêm origin của frontend vào `CORS_ORIGINS`, ví dụ:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Sau đó khởi động lại backend.

### Upload video thất bại

Phiên bản hiện tại giới hạn 48 MB và dùng standard upload. Video dài nên được
đưa vào Storage bằng resumable upload hoặc qua AI Worker.

## 7. Triển khai sau này

- Next.js frontend: Vercel.
- FastAPI backend: Render, Railway hoặc Cloud Run.
- Database, vector và file: Supabase.
- AI Worker RetinaNet: có thể chạy trên máy cá nhân hoặc Render Cron Job
  (xử lý video chờ theo lịch, có tính phí); không chạy trong Render API free.

Khi triển khai, đặt `BACKEND_INTERNAL_URL` trên Vercel thành URL HTTPS của FastAPI,
đặt `SUPABASE_SECRET_KEY` ở biến môi trường của backend và thêm domain Vercel vào
`CORS_ORIGINS`.

## Cấu trúc chính

```text
D:\NCKH
├── backend\            # FastAPI và Supabase client
├── frontend\           # Next.js App Router
├── .env.example        # Mẫu biến môi trường backend
├── requirements.txt    # Dependency Python đã ghim
└── README.md            # Tài liệu này
```
