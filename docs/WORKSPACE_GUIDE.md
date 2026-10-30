# Sử dụng Campus Trace

## Luồng giám sát nhanh

- Mở `/workspace` để xem camera và bản đồ cùng lúc. Mặc định dùng ba cảnh P-DESTRE quay từ UAV trong khuôn viên đại học; đây là ba phiên độc lập, chưa đồng bộ và chưa có tọa độ tại Cần Thơ.
- Bấm **Tìm người** ở góc phải hoặc thanh điều hướng. Bảng bên phải cho phép nhập đặc điểm, chọn camera, màu áo và màu quần/váy. Video phía sau vẫn phát; Escape đóng bảng và trả focus về nút đã mở.
- Chọn ảnh bằng **Xem trong camera** để làm nổi bật đúng ô, phát đúng đoạn xuất hiện và cập nhật người tham chiếu trên phần đối chiếu/bản đồ. Ảnh được trích từ video của phiên đang xem.
- Video chưa có kết quả AI hiện trạng thái rõ ràng. **Thử tìm trên kết quả mẫu MARS** chuyển sang dữ liệu MARS đã xử lý; không suy diễn đó là kết quả P-DESTRE và không tạo job GPU.
- **Quản lý** chứa nguồn video, kết nối/vị trí camera và lịch sử/xuất dữ liệu. **Không gian & quyền truy cập** mở công cụ sao lưu/khôi phục. Hiện quyền truy cập theo khóa không gian, chưa có tài khoản phân vai quản trị/người xem.

## Bắt đầu

1. Mở `/workspace`: tất cả video camera phát đồng thời trong lưới bên trái, bản đồ Khu II bên phải.
   Bấm nút phóng to trong từng ô để xem toàn màn hình; các video khác vẫn phát.
   Bấm camera trên bản đồ để làm nổi bật ô tương ứng, không ẩn các camera còn lại. Khi chưa có nguồn riêng,
   trang phát video mẫu có ghi rõ nguồn, không giả làm camera của trường.
2. Trong mục **Camera** hoặc **Video**, bấm **Bắt đầu**. Camera, lịch sử và ghi chú lưu ở Storage riêng tư
   trên máy chủ. Trình duyệt chỉ giữ khóa truy cập của không gian.
3. Mở tên không gian ở góc trên → **Sao lưu quyền truy cập**. Trên điện thoại, mở
   menu → **Không gian & quyền truy cập**. File này là quyền đọc/sửa dữ liệu,
   cần giữ riêng tư; mất file và xóa bộ nhớ trình duyệt sẽ không có cách tự phục hồi.

Để xem trước khi có GPU, bấm **Mở kết quả mẫu**. Đây là dữ liệu MARS đã xử lý trước,
không tạo job AI và không tăng lịch sử riêng. Các quyết định đối chiếu trên mẫu chỉ
xem; muốn lưu quyết định cần một phiên riêng đã hoàn thành.

## Camera và video

- **Xem camera**: mở sẵn video và bản đồ Khu II Đại học Cần Thơ trên nền OpenStreetMap, tại đường 3 Tháng 2.
  Có thể kéo, phóng to/thu nhỏ; bấm **Về khuôn viên** để trở lại trường.
- **Camera**: bấm bản đồ để thêm camera, nhập tên rồi lưu. Vị trí chọn được lưu thành
  vĩ độ/kinh độ trên máy chủ. Camera cũ chưa đặt tọa độ vẫn nằm trong danh sách để sửa.
  Danh mục hiện hỗ trợ tối đa 32 camera/không gian.
- **Video**: chọn bộ mẫu hoặc tải 2–3 video, mỗi file tối đa 48 MB. Phân tích tối đa
  30 giây đầu với tần suất không quá 10 frame/giây theo cấu hình worker hiện tại.
- Gắn mỗi video với camera trong danh mục để lưu vị trí theo phiên. Vị trí được
  chụp lại lúc gửi, nên sửa hoặc xóa camera sau này không làm thay đổi sơ đồ lịch sử.
- Nhập mốc bắt đầu theo cùng một đồng hồ khi biết. Không biết thì để trống;
  hệ thống không tự đặt các camera cách nhau 30 giây.
- Chỉ bấm **Bắt đầu phân tích** khi GPU sẵn sàng. Khi mạng tải lỗi, chọn lại các file
  theo thứ tự và bấm **Tiếp tục tải cùng phiên**; không cần tạo job trùng.
- **Camera RTSP** hiện tiếp nhận các đoạn ghi do gateway trong mạng trường gửi.
  Không phải dịch vụ xem trực tiếp hoặc giám sát 24/7. Xem `APPLICATION.md` để chạy gateway.

## Tìm người và đọc hành trình

Trong **Xem camera**, khi phiên có kết quả theo dõi, mở **Tìm người** và chọn ảnh hoặc chọn **Người đang theo dõi** để
hiện vệt chân trong các video có liên kết. Vệt chỉ nối các điểm đáy khung bao đã quan sát
trong 6 giây gần nhất; mất dấu thì ngắt, không kéo đường qua đoạn trống hoặc frame tương lai.
Có thể tắt **Hiện vệt di chuyển**. Video chưa phân tích không có vệt; dùng
**Xem hành trình mẫu** để thử bằng dữ liệu MARS đã lưu.

Bản đồ tự vẽ đường nối khi các camera trong liên kết có tọa độ. Nét đứt là ứng viên AI;
nét liền là xác nhận của người vận hành. Chỉ có mũi tên khi danh tính đã xác nhận và
thời gian đã đồng bộ. Camera chưa đặt tọa độ hiển thị liên kết ở sơ đồ phi địa lý riêng,
không gán vào khuôn viên. Vệt ảnh và đường liên camera không phải đường đi GPS thực tế.

1. Bấm **Tìm người theo đặc điểm** từ màn hình camera; lọc camera, màu áo/quần hoặc nhập
   mô tả như "áo đen quần xanh dương". Bộ lọc luôn hiển thị; chỉ có kết quả khớp khi phiên
   đã phân tích. Mở kết quả mẫu là một nguồn khác, được ghi rõ là MARS.
2. Ảnh là crop từ frame detection trong video, không phải ảnh minh họa.
3. Bấm **Xem hành trình** để mở bản đồ và video cạnh nhau.
4. Bấm lần xuất hiện để tua video. Chọn track ở camera khác để xem cặp ảnh/video.
5. Mở **Đối chiếu & ghi chú**, lưu **Cùng người**, **Khác người** hoặc **Chưa rõ**. Quyết định mới có
   thể bác bỏ gợi ý AI; các ghi nhận cũ vẫn được giữ trong nhật ký.
6. Đánh dấu vào/ra hoặc có mặt tại một giây cụ thể của video track gốc khi đã kiểm tra
   bằng mắt. Đây là đánh dấu thủ công, không phải bộ nhận dạng hành vi tự động.

Nét đứt biểu diễn ứng viên AI. Nét liền biểu diễn xác nhận của người vận hành. Mũi tên
chỉ dùng khi các lần xuất hiện đã xác nhận có mốc đồng bộ. Đường giữa camera là liên
kết các quan sát, không khẳng định quỹ đạo GPS hoặc đường đi ở vùng không có camera.
Không có tọa độ thì không đặt camera lên trường; có thể chuyển sang **Sơ đồ** để xem
liên kết phi địa lý. Dữ liệu MARS không được gán vị trí tại trường. Độ tương đồng không phải xác suất danh tính.

## Bản đồ điều tra tương tác

Bản đồ giữ màu gốc OpenStreetMap. Khung ngoài và bảng video có viền nhẹ; mở bản đồ không tự tô viền vào thẻ chọn chế độ.

Trong **Xem camera**, bấm **Mở bản đồ điều tra** trên bản đồ thu nhỏ.

- **Khuôn viên**: bấm vị trí để xem tọa độ; bấm camera để mở thẻ video và ảnh bằng chứng.
- **Liên kết camera**: bấm camera để phát đoạn xuất hiện, hoặc bấm đường nối để đối chiếu hai ảnh. Đây là sơ đồ phi địa lý.
- **Mở trên lưới camera** đưa đoạn bằng chứng về màn hình camera chính.
- **Thử bố trí camera trên bản đồ**: chọn camera rồi bấm vị trí. Vị trí này chỉ là minh họa, không ghi vào dữ liệu; đóng cửa sổ sẽ xóa. Không thay thế tọa độ thật đã lưu.

Dữ liệu MARS không có tọa độ trường. Cửa sổ luôn mở bản đồ khuôn viên, với danh sách camera và video bên cạnh; chỉ hiện thẻ **Liên kết camera** khi có liên kết để đối chiếu. Đường minh họa luôn là nét đứt, không có mũi tên và không chứng minh hành trình thực tế.

## Kết nối camera HLS / RTSP

Vào **Thiết lập camera → Thêm camera**, chọn **HLS · xem trong web** để nhập URL HTTPS, kiểm tra hình rồi lưu. Luồng xuất hiện trong lưới camera và bảng video bản đồ. Giao diện chỉ báo đang phát khi nhận được hình, có báo lỗi và kết nối lại. HLS dạng video có điểm kết thúc không được gắn nhãn trực tiếp.

**RTSP · qua gateway** lưu tên biến môi trường trên máy cùng mạng camera, không lưu URL/mật khẩu RTSP trên web. Có thể bổ sung HLS đầu ra từ bộ chuyển luồng để xem trong trình duyệt; gateway Python trong repo chỉ ghi clip, không phục vụ HLS. Xuất cấu hình 2–3 camera để thu clip và gửi AI; mật khẩu giữ ở máy gateway. Xem [hướng dẫn đầy đủ](CAMERA_CONNECTIONS.md).

Xem luồng và phân tích AI là hai tác vụ riêng. HLS không cần GPU chỉ để phát; GPU phải chạy khi gửi clip phân tích. Chưa có kiểm chứng với camera vật lý tại trường.

## Lịch sử

- **Lịch sử & xuất dữ liệu** ở cuối thanh điều hướng (trên điện thoại, mở menu): mở lại phiên, xuất JSON kèm ghi chú hoặc CSV các lần xuất hiện, xóa video
  và kết quả được chọn. Tối đa 100 phiên/không gian, 200 ghi chú/phiên trong cấu hình nghiên cứu.
- Quyền workspace giữ lịch sử lâu dài đến khi xóa, không phụ thuộc hạn 24 giờ của
  quyền khách theo job. Job tải quá 1 giờ hoặc chờ quá 24 giờ được báo hết hạn rõ ràng.
- Dữ liệu hiện lưu đến khi chủ không gian xóa; chưa có chính sách tự xóa theo số ngày.
- Các bảng benchmark, chỉ tiêu nghiên cứu và hướng dẫn lặp lại đã gỡ khỏi giao diện chính.
  Web không tự tính accuracy/mAP nếu không có ground truth.

## Phạm vi hiện tại

Web có luồng quản lý và đối chiếu nghiên cứu xuyên suốt. Không gian dùng quyền theo
khóa 256 bit, chưa có tài khoản tổ chức/phân vai quản trị. GPU Kaggle phải đang chạy
để tạo kết quả mới. ViT/DynaMix, FAISS, AFLink/GSI và bộ phân loại hành vi chưa được
coi là đã triển khai; trạng thái được ghi rõ trong màn hình Nghiên cứu. Không thêm OSNet.
