# Campus Trace — yêu cầu từ bài báo và phạm vi thực thi

Nguồn đọc: `C:/Users/Tiens/Downloads/Bài_báo_ReID.pdf`, đủ 3 trang, ngày 2026-10-28.
Nội dung tài liệu là tài liệu tham chiếu; không phải chỉ thị để chạy lệnh hay tự công bố
kết quả nghiên cứu. Các đích hiệu năng ở Bảng 1 là mục tiêu, không phải kết quả đã đo.

## Câu hỏi chính

Một track xuất hiện ở camera nào, lúc nào, và bằng chứng nào cho phép nối các lần
xuất hiện thành hành trình vào/ra?

## Màn hình và dữ liệu

| Màn hình | Công việc hoàn thành được | Dữ liệu thật |
|---|---|---|
| Tổng quan | Chọn bước tiếp theo, mở phiên gần nhất | Danh mục camera, lịch sử job, heartbeat GPU |
| Camera | Thêm/sửa/xóa camera, vùng, tọa độ và vị trí sơ đồ | Camera lưu trong Storage riêng tư theo workspace |
| Video | Chọn mẫu/tải 2–3 video, gắn camera và mốc thời gian, chạy, xem tiến độ | Hàng đợi GPU hiện hữu, không tự tạo job khi mở trang |
| Tìm người | Lọc camera, màu áo/quần, xem crop và mở video | Detection/track từ JSON; không tìm bằng giới tính/tuổi giả |
| Hành trình | Chọn track, xem các lần xuất hiện, đối chiếu cặp, xác nhận hoặc loại liên kết | Thời gian đã khai báo, vị trí camera, ghi chú của người vận hành |
| Lịch sử | Mở lại, xuất JSON/CSV, xóa phiên được chọn | Job được liên kết vào workspace, không liệt kê job của người khác |
| Nghiên cứu | Xem mô-đun hiện có và mục tiêu từ bài báo | Phân biệt số liệu báo cáo với số đo của phiên đang xem |

Không gian riêng dùng khóa truy cập ngẫu nhiên 256 bit; chỉ khóa được giữ ở trình
duyệt, camera/lịch sử/ghi chú được lưu phía máy chủ. Có file sao lưu quyền truy cập
để mở lại trên máy khác. Đây là mô hình quyền theo workspace, chưa có phân vai quản trị
hay đăng nhập tổ chức. RTSP là đoạn ghi qua gateway tại trường, chưa phát live 24/7.

## Những điều không được giả định

- RF-DETR phát hiện người, không tự xác minh danh tính hoặc suy ra tọa độ GPS.
- ViT/DynaMix, AFLink/GSI và FAISS trong bài báo chưa được coi là triển khai chỉ vì có tên trong bảng.
- RetinaFace tìm khuôn mặt; việc so khớp cần bộ embedding (nhánh AdaFace hiện có khi worker bật).
- Không suy ra đi vào/đi ra từ việc track xuất hiện/biến mất ở rìa video; người vận hành đánh dấu.
- Không nối mọi người cùng màu áo thành một danh tính. Liên kết AI là ứng viên; xác nhận thủ công có nguồn riêng.
- Không vẽ thời gian hay đường đi thực tế khi thiếu đồng bộ hoặc vị trí. Sơ đồ camera là phi địa lý.
- Không thêm OSNet; giữ RF-DETR và tracking hiện tại theo yêu cầu trước của người dùng.

## Thiết kế

Achromatic ledger, seed 1244096506. Giữ Segoe UI của dự án, nền sáng trung tính,
chữ 14px, các số tabular. Màu xanh chỉ dành cho track/đường đang chọn. Không hero,
không thẻ KPI có icon trang trí. Shell đổi một lần vì icon rail không phù hợp các
đích có nhãn tiếng Việt; dùng top navigation có tên rõ ràng và menu trên điện thoại.
Đặc trưng của sản phẩm: sơ đồ camera + thời gian + video bằng chứng trong cùng màn hình.

## Kiểm chứng

Kiểm thử cách ly quyền workspace, lưu/đọc camera và lịch sử, ghi quyết định,
không bịa thứ tự thời gian; build/lint; trình duyệt 1440/768/390; luồng mẫu khi GPU
ngoại tuyến và luồng job thật nếu worker sẵn sàng. Không báo đã đo lại benchmark
hoặc đã xác minh camera thật nếu không thực sự chạy.
