# Chạy RetinaNet trên Kaggle khi cần

Notebook: [`retinanet_kaggle.ipynb`](retinanet_kaggle.ipynb). Đây là nơi chạy AI
theo yêu cầu, **không phải backend API luôn trực tuyến**. FastAPI miễn phí trên
Render tiếp tục nhận video cho [giao diện Next.js](https://nckh-reid.vercel.app/videos)
và sẽ tự ngủ khi không có truy cập.

1. Trên Kaggle, tạo Notebook mới rồi dùng **File → Import Notebook** để tải
   `retinanet_kaggle.ipynb` từ máy lên. Chưa có kết nối Kaggle trong dự án nên
   bước import này cần bạn thực hiện.
2. Trong Settings của Notebook, bật **Internet**. Có thể chọn **GPU** nếu tài
   khoản được cấp GPU; Notebook cũng chạy được bằng CPU.
3. Vào **Add-ons → Secrets**, tạo secret tên `SUPABASE_SECRET_KEY` với giá trị
   khóa `sb_secret_...` của dự án Supabase, rồi gắn secret đó với Notebook.
   Không dán khóa vào ô mã, không chia sẻ ảnh chụp màn hình chứa khóa.
4. Trên web, thêm camera và upload video có người thật (tối đa 48 MB). Sau đó
   trở lại Kaggle, bấm **Run All**. Notebook lấy tối đa 20 video trạng thái
   `pending`, lưu JSON chi tiết trong bucket riêng tư `raw-detections` và cập
   nhật tóm tắt trong bảng `videos`.
5. Tải lại trang Video trên web và bấm **Xem tóm tắt**. Nếu muốn xử lý video mới,
   chạy lại Notebook khi cần. Video mẫu hình vẽ có thể cho 0 khung bao.

Kaggle Notebook có giới hạn phiên chạy và không cung cấp API ổn định cho web;
vì vậy không dùng nó thay toàn bộ FastAPI. Không đưa dữ liệu hình ảnh cá nhân
hoặc video camera lên dịch vụ bên ngoài khi chưa có quyền và sự đồng ý cần thiết.

Nếu code từ GitHub thay đổi, chạy lại ô đầu tiên để `git pull --ff-only` trước
khi xử lý. Không lưu output Notebook chứa thông tin nhạy cảm.
