# Mâu thuẫn và điểm cần chốt trong Fix Plan

Tài liệu đối chiếu: [CODE_REVIEW_FIX_PLAN.md](./CODE_REVIEW_FIX_PLAN.md)

## 1. Quy cách đóng gói chưa có một nguồn dữ liệu thống nhất

- Phần quyết định kiến trúc yêu cầu lưu `PackagingSpec` theo từng sản phẩm.
- Phần triển khai lại đề xuất một từ điển quy cách cố định cho 35 thuốc.
- Phần schema và ma trận file chỉ thêm `Unit` và `BaseQuantityDeducted` vào `InvoiceItem`, chưa lưu quy cách trên `Product` hoặc bảng riêng.
- Chưa có kế hoạch cập nhật form sản phẩm, kiểu dữ liệu frontend, import/export và dữ liệu seed.

**Cần chốt:** quy cách được lưu ở đâu và cách cập nhật quy cách khi thêm hoặc sửa sản phẩm.

## 2. Đơn vị tồn kho không thể biểu diễn phần thuốc còn lại trong gói

- `Product.Quantity` hiện là số nguyên theo đơn vị sản phẩm như hộp, lọ hoặc chai.
- Plan yêu cầu `BaseQuantityDeducted` cũng là số nguyên theo `Product.Unit`.
- Kịch bản bán 11 viên lại trừ nguyên 1 hộp. Phần viên còn trong hộp sau khi mở không được lưu, nên lần bán tiếp theo có thể tiếp tục tính như còn nguyên hộp.

**Cần chốt:** tồn kho được quản lý bằng đơn vị cơ sở nhỏ nhất có thể bán, hay chỉ cho phép bán nguyên gói. Nếu cho bán lẻ, lượng bán và hoàn phải quy đổi chính xác, không làm tròn nguyên hộp.

## 3. Kế hoạch di trú hóa đơn cũ dựa vào dữ liệu lịch sử không có

- Script dự kiến suy ra đơn vị bán từ `UnitPrice` so với giá hiện tại của sản phẩm.
- Schema không lưu giá hoặc quy cách đóng gói tại thời điểm lập hóa đơn; giá và quy cách hiện tại có thể đã thay đổi.
- Plan khai báo `BaseQuantityDeducted` mặc định bằng `1`, nhưng script lại tìm giá trị trống hoặc `0` để nhận diện dòng cũ.

**Cần chốt:** cho phép trường mới nullable trong giai đoạn di trú; chỉ tự điền những bản ghi xác minh được. Các dòng không thể xác minh cần được đánh dấu xử lý thủ công, không suy đoán.

## 4. Hoàn điểm khi hủy hóa đơn thiếu dữ liệu lưu vết

- Plan yêu cầu lưu số điểm đã dùng và hoàn điểm đó khi hủy hóa đơn.
- Schema minh họa chỉ thêm trường trên `InvoiceItem`; chưa lưu `UsedPoints` hoặc `PointsEarned` trên hóa đơn hay bảng giao dịch điểm.

**Cần chốt:** lưu số điểm đã dùng và đã cộng trên hóa đơn hoặc tạo sổ giao dịch điểm. Luồng hủy phải dựa trên dữ liệu đã lưu và chỉ hoàn một lần.

## 5. Ma trận phân quyền không khớp route hiện tại và chưa liệt kê đủ endpoint

- Plan dùng `/api/auth/users/*`, nhưng route nhân sự hiện nằm dưới `/api/enterprise/staff`; chưa mô tả endpoint Admin dùng để kích hoạt tài khoản.
- Plan ghi contact là `GET/PUT`, trong khi code hiện có `GET`, `POST` và `PATCH /:id/reply`.
- Quyền cho `/api/enterprise/*` được gom theo wildcard, dù route trong nhóm có nhiều chức năng và yêu cầu quyền khác nhau.
- Bước gắn middleware liệt kê product, invoice, enterprise và AI, nhưng bỏ sót contact routes.
- Bảng quyền chưa mô tả rõ các thao tác import/export, xóa, nhân bản, staff và payments.

**Cần chốt:** lập allowlist công khai và ma trận quyền theo từng route thực tế; cập nhật các route kích hoạt nhân viên và bảo vệ contact phù hợp.

## 6. Luồng token frontend chưa được nối hết

- Plan yêu cầu interceptor đọc token từ `localStorage`, nhưng chưa chỉ rõ nơi lưu token nhận từ login/register.
- `App.tsx` hiện nhận callback xác thực nhưng chỉ cập nhật user, bỏ qua tham số token.
- Interceptor dự kiến phát sự kiện khi nhận `401`, nhưng ma trận file chưa nêu nơi lắng nghe sự kiện và đưa ứng dụng về trạng thái đăng nhập.
- Giao diện hiện khởi tạo sẵn một user `ADMIN`; plan chưa mô tả việc bỏ trạng thái mặc định này hoặc khôi phục phiên qua API.

**Cần chốt:** cập nhật `AuthPage`, `App.tsx` và toàn bộ API services để lưu/gửi token, xử lý phiên hết hạn và khởi tạo user từ phiên hợp lệ.

## 7. Fail-fast `JWT_SECRET` có thể chạy sau lúc controller đã đọc cấu hình

- `index.ts` gọi `dotenv.config()` trong phần thân module.
- `auth.controller.ts` đọc `JWT_SECRET` ở cấp module.
- Nếu controller được import trước khi phần thân `index.ts` chạy, kiểm tra fail-fast sau đó không đảm bảo controller đã đọc giá trị từ `.env`.

**Cần chốt:** nạp và kiểm tra cấu hình trước khi import các module phụ thuộc biến môi trường, hoặc dùng một module cấu hình tập trung được khởi tạo đúng thứ tự.

## 8. Tiêu chí OCR có thể loại nhầm thuốc hợp lệ ngoài danh mục

- Plan nói ảnh không có từ khóa thuốc trong danh mục thì từ chối kết quả.
- Đơn thuốc có thể chứa thuốc chưa có trong kho; việc không tìm thấy sản phẩm không đồng nghĩa ảnh không đọc được.

**Cần chốt:** tách kết quả OCR thô khỏi bước đối chiếu tồn kho. Cho dược sĩ xem và xử lý tên thuốc chưa khớp; tuyệt đối không tự chuyển thuốc chưa xác minh vào POS.

## Thứ tự nên giải quyết

1. Chốt mô hình tồn kho cơ sở và quy cách đóng gói.
2. Chốt cách xử lý dữ liệu hóa đơn cũ.
3. Bổ sung lưu vết đổi/cộng điểm.
4. Đồng bộ route, ma trận RBAC và vòng đời token frontend.
5. Chốt hành vi OCR cho thuốc chưa có trong danh mục.
