# Dùng demo RetinaNet

## Xử lý một đợt video

1. Trên web, mở **Video**, chọn video mẫu hoặc tải các video của bạn, rồi bấm **Gửi video đi xử lý**.
2. Mở [notebook Kaggle](https://www.kaggle.com/code/tiens0710/nckh-retinanet-worker/edit) và bấm **Run All** một lần cho cả đợt. Notebook xử lý tối đa 20 video đang chờ.
3. Quay lại web ở trang **Kết quả**. Trạng thái và kết quả bounding box tự cập nhật; không cần tải lại trang.

Video gửi sau khi notebook đã kết thúc sẽ cần một lượt **Run All** mới. Có thể gửi nhiều video lên web trước để Kaggle xử lý chung trong một lượt.

## Thiết lập Kaggle lần đầu

- Trong Notebook Settings, bật **Internet**; chọn GPU nếu có, nhưng CPU vẫn chạy được.
- Thêm secret `SUPABASE_SECRET_KEY` trong **Add-ons → Secrets**. Nếu chưa thêm, notebook sẽ hỏi khóa khi chạy. Không ghi khóa vào code hoặc chia sẻ khóa.
- Chạy **Run All**. Khi notebook kết thúc, nó báo số khung người đã phát hiện.

Notebook dùng RetinaNet để phát hiện người, không làm tracking/Re-ID. Video phải là video bạn có quyền sử dụng; Kaggle là phiên chạy có giới hạn, không phải backend hoạt động liên tục.
