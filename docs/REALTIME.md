# Giám sát AI liên tục

Gateway chạy thường trực, nhận RTSP và chạy RF-DETR Medium một lần nạp mô hình. Mỗi camera chỉ giữ frame mới nhất, không xếp hàng các đoạn video. Web đọc kết quả tự động mỗi 500 ms; không cần bấm Detect. Ảnh và khung bao luôn thuộc cùng một frame, không chồng kết quả AI lên HLS chưa đồng bộ.

## Máy gateway

Máy cần đọc được camera trong mạng nội bộ. GPU phù hợp cho giám sát liên tục; CPU có thể thử video mẫu, nhưng tốc độ thực phụ thuộc máy và số camera. Kaggle và hàng đợi clip hiện có không phải backend luôn bật cho luồng này.

```powershell
python -m pip install -r backend/requirements-realtime.txt
Copy-Item config/realtime-gateway.example.json realtime-gateway.json
python -c "import secrets; print(secrets.token_urlsafe(32))"
# Đặt kết quả lệnh trên vào REALTIME_READ_TOKEN trên gateway, giữ riêng.
# Đặt CAMPUS_GATE_RTSP và CAMPUS_YARD_RTSP bằng URL camera thật.
python -m backend.realtime_gateway --config realtime-gateway.json
```

Trong file cấu hình, đặt `consent=true` khi được phép xử lý camera; khai báo camera ID, biến RTSP, origin web chính xác. Có thể thay `rtsp_url_env` bằng `video_path` để mô phỏng bằng video ghi sẵn; kết quả được gắn nhãn mô phỏng. `target_fps=2` là mục tiêu lấy mẫu mỗi camera, không phải cam kết FPS đo được.

Gateway mặc định nghe ở `127.0.0.1:8090`. Đặt sau reverse proxy HTTPS với chứng chỉ hợp lệ, hoặc dùng `--host`, `--tls-cert`, `--tls-key` phù hợp. Chỉ một tiến trình gateway/mô hình cho một cấu hình; triển khai thành dịch vụ tự khởi động lại trên máy GPU nếu cần chạy 24/7.

## Web

Vào **Thiết lập camera → Thêm camera → Camera + AI tự động**. Nhập:

- URL riêng của camera: `https://ai.example.edu/cameras/gate/latest`.
- Khóa đọc tương ứng với `REALTIME_READ_TOKEN` trên gateway (không phải mật khẩu RTSP).

Lưu camera rồi mở **Xem camera**. Web tự nhận và vẽ phát hiện; gateway vẫn tiếp tục xử lý khi người xem đóng trình duyệt. Khóa đọc lưu trong workspace riêng; chỉ cấp quyền đọc kết quả gateway. Không chia sẻ file quyền workspace hay cấu hình có khóa thật.

Web hiển thị FPS đo được và tuổi frame tính từ lúc gateway nhận ảnh, không phải timestamp phơi sáng camera. Kết quả quá 3 giây, mất kết nối hoặc sai camera sẽ không được vẽ như dữ liệu hiện tại. Độ tin cậy detection không phải xác suất danh tính. Luồng mới chỉ phát hiện người theo frame, chưa tự xác nhận cùng một người giữa hai camera và chưa lưu lịch sử realtime.

## Kiểm chứng và giới hạn

RF-DETR thật đã chạy trên một frame i.c.sens bằng CPU: khoảng 735 ms suy luận, 8 khung bao người; đây là smoke test, không phải benchmark FPS liên tục hay đánh giá accuracy. Test web kiểm tra hạn sử dụng/geometry của frame; test gateway kiểm tra bỏ backlog, khớp ảnh/khung bao, hết hạn, quyền đọc và CORS.

Chưa kiểm chứng camera vật lý hoặc vận hành GPU 24/7. Gateway chưa được triển khai thành dịch vụ GPU công khai; cập nhật code web không tự cấp máy GPU hay tự kết nối mạng camera của trường.
