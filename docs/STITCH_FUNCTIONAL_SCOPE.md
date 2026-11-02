# Chức năng đối chiếu với Stitch

Nguồn: https://stitch.withgoogle.com/projects/5463930493913830199 (đọc ngày 02/11/2026).

Bản Stitch có bốn màn hình chi tiết (Tổng quan, Camera, Tìm người, Hành trình) cùng menu Hồ sơ đối tượng, Phân tích và Nhật ký. Các thông số, danh tính, xác suất, camera và tốc độ trong mẫu là dữ liệu minh họa, không phải tiêu chí để điền số giả.

Phạm vi tích hợp:
- Tổng quan: thống kê từ kết quả đang mở, biểu đồ số phát hiện theo thời gian, danh sách sự kiện, lọc nguồn/khu vực và mở camera.
- Camera: tra cứu tên/khu vực, lọc giao thức, lưới/bảng, xem nguồn riêng, kết nối RTSP/HLS/AI hiện có. PTZ chỉ dùng khi có gateway hỗ trợ và thiết bị đã xác minh; không giả lập lệnh điều khiển thành công.
- Tìm kiếm: bộ lọc, mô tả ngôn ngữ tự nhiên qua API được xác thực, ngưỡng tin cậy phát hiện (không phải độ tương đồng danh tính), xuất CSV, xem bằng chứng, lưu hồ sơ đối tượng để đối chiếu.
- Hành trình: bật/tắt lớp camera/liên kết/bản đồ mật độ theo camera/vùng do người dùng vẽ; phát lại các quan sát với tốc độ 1x/2x/5x; xuất và in hồ sơ. Camera thiếu tọa độ không được gán vị trí trường; thiếu đồng bộ giờ không suy ra thứ tự liên camera.
- Hồ sơ, sự kiện nội bộ, vùng và nhật ký: lưu trong không gian riêng, xác thực phía máy chủ; không gửi lệnh điều phối hoặc thông báo cho bên thứ ba.
- Phân tích: kết quả thực của phiên, không suy diễn 24 giờ, số người riêng biệt, khoảng cách/tốc độ vật lý hoặc uptime khi chưa đo.
- Cài đặt: tên không gian, giao diện sáng/tối, sao lưu quyền truy cập và nhật ký từ các thao tác đã được ghi nhận. Chưa có tài khoản phân vai.

RF-DETR, Re-ID, phân loại phụ kiện/hành vi, PTZ phần cứng và camera 24/7 cần dịch vụ/model/thiết bị tương ứng. Giao diện nêu rõ khả năng và trạng thái; không coi thay đổi web là đã triển khai các mô hình đó.

## Kiểm chứng bản triển khai

- 62 bài kiểm thử tự động đạt; có kiểm tra cách ly workspace, hồ sơ phải gắn với bằng chứng thuộc phiên, trạng thái sự kiện, hình học vùng và xác thực trước khi gọi AI.
- Thử trên trình duyệt với kho Storage giả lập cục bộ: lưu hồ sơ và tải lại, ghi nhận/đóng sự kiện, cập nhật số thông báo, lưu vùng và kiểm tra nhật ký, lọc camera/chuyển bảng, mở chi tiết, hiển thị mật độ/vùng và đổi tốc độ video thật sang 2x.
- Kiểm tra responsive và sửa khối đối tượng bị co hẹp trên điện thoại; bố cục không tràn ngang.
- Không gửi tin nhắn/điều phối tuần tra; sự kiện là bản ghi nội bộ. Không dùng thông số hoặc tên người giả trong Stitch làm dữ liệu thật.
- Trợ lý mô tả sử dụng hạ tầng Gemini hiện có; vẫn cần khóa API hợp lệ và hạn mức dịch vụ. Chưa kiểm chứng thao tác PTZ trên phần cứng hoặc vận hành AI liên tục 24/7.
