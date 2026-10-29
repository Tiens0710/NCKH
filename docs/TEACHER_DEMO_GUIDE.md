# Kịch bản trình bày Campus Trace

## Mục tiêu của bản mẫu

Cho người xem tự kiểm tra kết quả: mô tả người → ảnh tìm thấy → đoạn video ở từng camera → liên kết quan sát và giới hạn trên bản đồ. Không dùng việc giao diện đẹp hoặc có bounding box để thay cho bằng chứng nhận diện đúng danh tính.

## Trình bày trong khoảng 3 phút

1. Mở `/workspace`. Các camera đang phát video mẫu ghi sẵn đồng thời. Nói rõ chưa kết nối camera thật tại trường.
2. Bấm **Mở dữ liệu mẫu đã xử lý**. Nguồn chuyển từ i.c.sens đầu vào sang kết quả MARS lưu sẵn; đây không phải lần chạy AI mới trên i.c.sens.
3. Nhập **áo đen**, bấm **Tìm trong video**. Các ảnh được crop từ detection thực. Số kết quả là số đoạn theo dõi, không phải số người duy nhất.
4. Chọn ảnh tại **MARS · Camera 5**. Ô thứ tư của lưới hiển thị ảnh tham chiếu, trang phục và nguồn camera. Camera 3 là ứng viên liên kết; Camera 2 tuy tương tự trang phục vẫn được giữ riêng khi chưa có liên kết.
5. Bấm ảnh hoặc nút phát ở lần xuất hiện **Camera 3**. Video camera đó tua đến đoạn đã quan sát, dừng ở cuối đoạn; các camera khác tiếp tục phát. Bấm **Toàn bộ** để trở lại phát cả video. Có thể phóng to từng camera để đối chiếu.
6. Xem vệt trong video và liên kết camera. MARS không có tọa độ trường hoặc đồng hồ đồng bộ: ứng dụng không tự đặt camera mẫu lên CTU hoặc vẽ mũi tên theo thứ tự chưa biết. Khi video riêng được gắn camera có tọa độ, liên kết xuất hiện trên bản đồ. Đường nối là liên kết quan sát, không phải lối đi GPS đã đo.
7. Mở **Ghi nhận xác nhận** để giải thích quy trình kiểm chứng bằng video. Bản MARS là nguồn mẫu chỉ xem, không giả lập thao tác xác nhận đã lưu. Phiên riêng có quyền truy cập mới lưu được ghi chú/đối chiếu.

## Trình bày số liệu đúng phạm vi

Mở **Đánh giá bằng dữ liệu gán nhãn**. Khi chưa có nhãn, ứng dụng hiển thị chưa có số đo độ chính xác. Tốc độ hiển thị là log của phiên lưu sẵn, không phải benchmark mới.

- Tải cấu trúc JSON của đúng phiên, giữ `source_id`, rồi gán bounding box độc lập cho các frame được chọn. `boxes: null` chưa phải nhãn; `boxes: []` là đã kiểm tra không có người.
- Nạp file nhãn để tính TP/FP/FN, Precision, Recall và F1 của phát hiện người tại IoU ≥ 0,5. Một prediction chỉ khớp một box thật, xử lý theo confidence giảm dần.
- Accuracy là phân loại **frame có/không có người**, không phải accuracy danh tính hay tracking. Frame thiếu nhãn không được coi là âm tính. Tập chỉ có frame dương tính được cảnh báo.
- File nhãn phải khớp `source_id`, camera và frame của phiên hiện tại. Không chép prediction làm ground truth. Tải báo cáo JSON để lưu nguồn, phạm vi và các bộ đếm.

## Những điều bản hiện tại chưa chứng minh

Chưa có video thật của khuôn viên, tọa độ/đồng hồ camera thực và ground truth độc lập cho phiên mẫu đang mở. Chưa có kết quả kiểm thử nhận diện danh tính liên camera trên dữ liệu trường. Vệt trên ảnh chưa được hiệu chuẩn để chuyển thành quỹ đạo GPS. Những giới hạn này được giữ rõ ràng trong giao diện thay vì thay bằng vị trí hoặc số đo giả.
