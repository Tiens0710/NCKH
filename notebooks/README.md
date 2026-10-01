# Chạy RetinaNet trên Kaggle khi cần

Notebook: [`retinanet_kaggle.ipynb`](retinanet_kaggle.ipynb). Đây là nơi chạy AI
theo yêu cầu, **không phải backend API luôn trực tuyến**. FastAPI miễn phí trên
Render tiếp tục nhận video cho [giao diện Next.js](https://nckh-reid.vercel.app/videos)
và sẽ tự ngủ khi không có truy cập.

1. Import phiên bản mới của `retinanet_kaggle.ipynb` vào Kaggle (hoặc cập nhật
   các cell theo notebook này). Chưa có kết nối Kaggle trong dự án nên bước
   cập nhật notebook cần bạn thực hiện.
2. Trong Settings của Notebook, bật **Internet**. Có thể chọn **GPU** nếu tài
   khoản được cấp GPU; Notebook cũng chạy được bằng CPU.
3. Ở ô thứ hai, khi Notebook hỏi khóa, dán `sb_secret_...` của dự án Supabase
   rồi nhấn Enter. Ô nhập ẩn ký tự và không lưu khóa trong file Notebook.
   Nếu muốn khỏi nhập lại, có thể lưu khóa dưới tên `SUPABASE_SECRET_KEY`
   trong **Add-ons → Secrets** và gắn nó với Notebook. Không ghi khóa cố định
   vào ô mã, không chia sẻ ảnh chụp màn hình chứa khóa.
4. Bấm **Run All** một lần và để phiên Kaggle chạy. Worker chạy nền, kiểm tra
   hàng đợi mỗi 10 giây và tự xử lý video mới; không cần quay lại Kaggle để bấm
   chạy cho từng video. Trên web, thêm camera rồi gửi video mẫu hoặc upload video
   (tối đa 48 MB). Kết quả JSON được lưu trong bucket riêng tư `raw-detections`,
   phần tóm tắt lưu trong `videos.metadata.detection`.
5. Tải lại trang kết quả trên web để xem video đã xử lý. Có thể chạy lại cell
   trạng thái trong Kaggle để xem log/trạng thái gần nhất. Khi demo xong, dừng phiên
   Kaggle để worker không tiếp tục dùng tài nguyên. Nếu phiên Kaggle tự dừng,
   worker ngừng nhận việc cho đến lần khởi động tiếp theo. Video mẫu hình vẽ có
   thể cho 0 khung bao.

Notebook hiển thị mã commit và phiên bản PyTorch/TorchVision để đối chiếu các
lần chạy. Cell Worker có thể chỉnh `score_threshold`, `sample_seconds`,
`max_frames` và `max_image_side` **trước khi khởi động**. Mặc định 120 frame với
chu kỳ 0,5 giây chỉ quét khoảng 60 giây đầu; web sẽ cảnh báo nếu chưa quét hết.
Đặt `max_frames = 0` để quét toàn video (tốn thêm GPU/thời gian). Nếu đổi các
giá trị này sau khi Worker đã chạy, cần dừng worker cũ rồi chạy lại cell Worker.
Cell kiểm tra trực quan ở cuối notebook sẽ lấy frame đầu có người và vẽ box;
trang Kết quả của Streamlit có video phủ box trong quá trình phát.

Kaggle Notebook có giới hạn phiên chạy và không cung cấp API ổn định cho web;
vì vậy không dùng nó thay toàn bộ FastAPI. Không đưa dữ liệu hình ảnh cá nhân
hoặc video camera lên dịch vụ bên ngoài khi chưa có quyền và sự đồng ý cần thiết.

Nếu code từ GitHub thay đổi, chạy lại ô đầu tiên để `git pull --ff-only` trước
khi xử lý. Không lưu output Notebook chứa thông tin nhạy cảm.
