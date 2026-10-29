# Kết nối camera

Vào **Thiết lập camera → Thêm camera**, chọn nguồn. Cấu hình được lưu theo quyền của không gian riêng. Việc lưu cấu hình không chứng minh thiết bị đang trực tuyến.

## HLS: xem trong web

Chọn **HLS · xem trong web**, nhập URL HTTPS của playlist, bấm **Kiểm tra luồng**, rồi lưu. Luồng xuất hiện trên lưới camera và trong bảng video của bản đồ. Bộ phát chỉ báo đang phát khi video phát được; lỗi có nút kết nối lại. Mở lại bản ghi từ nút **Xem kết quả đã lưu** nếu đang có phiên phân tích.

URL không chứa `user:password@host`. Nếu gateway bảo vệ luồng, cấu hình quyền xem dành cho trình duyệt tại gateway. Gateway phải cung cấp chứng chỉ HTTPS hợp lệ và CORS cho origin web; playlist, segment và khóa mã hóa nếu có đều phải truy cập được. Trang HTTPS không phát luồng HTTP. H.264/AAC là lựa chọn tương thích phổ biến; không mặc định mọi codec camera đều phát được.

Chrome dùng hls.js nạp động; Safari có thể dùng HLS gốc. Nguồn có `EXT-X-ENDLIST` được xem là video HLS, không gắn nhãn trực tiếp. Không chạy RF-DETR liên tục trên các luồng đang xem: AI hiện xử lý clip đã gửi vào hàng đợi.

## RTSP: ghi clip qua gateway trong LAN

Chọn **RTSP · qua gateway**, khai báo tên biến, ví dụ `CAMPUS_CAMERA_1_RTSP`. Mỗi camera dùng một biến khác nhau. Không nhập URL/mật khẩu RTSP vào web. Nếu có sẵn HLS từ bộ chuyển luồng, điền thêm URL để xem trong lưới.

Gateway Python trong repo ghi đồng thời 2–3 camera thành clip 15 giây, gửi clip lên hàng đợi AI. Nó không phục vụ HLS và không phải dịch vụ giám sát liên tục. Để chuyển RTSP sang HLS cần một dịch vụ riêng như MediaMTX, đặt cùng mạng với camera; khai báo URL HTTPS đầu ra của dịch vụ đó trong web.

Trên máy cùng mạng camera, ở thư mục repo:

```powershell
python -m pip install -r backend/requirements-camera.txt
# Ví dụ minh họa: thay bằng URL do quản trị viên camera cung cấp.
$env:CAMPUS_CAMERA_1_RTSP = 'rtsp://USER:PASSWORD@192.168.1.10:554/stream'
$env:CAMPUS_CAMERA_2_RTSP = 'rtsp://USER:PASSWORD@192.168.1.11:554/stream'
```

Trong web mở **Cấu hình RTSP và gateway → Tải cấu hình gateway**. Đặt file `camera-gateway.json` trong thư mục đang chạy. File chỉ chứa tên biến môi trường, không chứa mật khẩu; không tự gán mốc thời gian đồng bộ. Sau khi kiểm tra quyền ghi hình, đổi `consent` thành `true`.

```powershell
python -m backend.camera_gateway --config camera-gateway.json --check
python -m backend.camera_gateway --config camera-gateway.json
```

Lệnh `--check` chỉ xác thực cấu hình, không kết nối camera. Lệnh ghi kiểm tra GPU trước khi thu; nếu GPU tắt thì dừng, không giả là đã gửi AI. RTSP dùng TCP; có timeout và giới hạn thời lượng/kích thước. File `access.json` trong thư mục kết quả giữ quyền xem phiên: nhập tại **Video → Camera RTSP → Mở phiên do gateway gửi**. Giữ riêng file này, không commit URL thật, mật khẩu hoặc quyền truy cập.

ONVIF discovery/PTZ, WebRTC và phân tích luồng liên tục chưa triển khai. Không mở cổng RTSP của camera trực tiếp lên Internet chỉ để dùng web.

## Đã kiểm tra

- HLS tạo từ video mẫu: phát trong Chromium qua hls.js, xem trong bản đồ, sửa/lưu cấu hình, báo lỗi URL không tồn tại và phục hồi khi thay URL hợp lệ.
- API: kiểm tra quyền workspace, URL HTTPS, loại bỏ trường dư, không nhận mật khẩu trong URL; tên biến RTSP và xuất cấu hình đúng camera.
- Gateway: kiểm tra cấu hình, giữ file quyền khi upload lỗi, xác thực gửi job, và decode/encode video mẫu. Chưa có camera vật lý để xác minh RTSP trên mạng trường.

Tài liệu: [hls.js](https://github.com/video-dev/hls.js/blob/master/docs/API.md), [MDN về luồng video trên web](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/Live_streaming_web_audio_and_video), [MediaMTX về chuyển giao thức](https://mediamtx.org/docs/features/publish-and-read).
