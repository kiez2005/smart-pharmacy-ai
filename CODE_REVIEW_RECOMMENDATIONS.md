# Đề xuất xử lý các vấn đề trong code review

## 1. Khóa quyền truy cập API

- Bỏ trường `Role` khỏi dữ liệu đăng ký công khai.
- Gán quyền thấp nhất cho tài khoản mới hoặc để tài khoản chờ Admin duyệt.
- Thêm middleware kiểm tra JWT và quyền theo từng route; chỉ để công khai các route thực sự cần như đăng nhập, đăng ký hoặc gửi yêu cầu tư vấn.
- Bắt buộc cấu hình `JWT_SECRET` từ môi trường và từ chối đăng nhập tài khoản đã vô hiệu hóa.

## 2. Sửa quy đổi tồn kho và hoàn trả

- Tạo một hàm quy đổi dùng chung cho lúc bán, tính giá và hoàn hàng.
- Lưu trên mỗi dòng hóa đơn cả đơn vị khách mua (`Hộp`/`Vỉ`/`Viên`) và lượng tồn kho gốc đã trừ.
- Khi hủy hóa đơn, cộng lại chính lượng tồn kho gốc đó.
- Thay giả định “10 vỉ/hộp” và “100 viên/hộp” bằng thông tin quy cách của từng sản phẩm.

## 3. Làm rõ và sửa luồng OCR

- Tích hợp bộ nhận dạng chữ thực sự; ảnh không đọc được phải báo lỗi hoặc yêu cầu nhập lại.
- Hiển thị kết quả để dược sĩ kiểm tra tên thuốc, số lượng và liều dùng trước khi chuyển sang POS.
- Đánh dấu rõ các đơn mẫu hiện có là dữ liệu demo.

## 4. Giới hạn chiết khấu ở backend

- Tính tổng tiền từ giá trong cơ sở dữ liệu rồi từ chối hóa đơn nếu chiết khấu lớn hơn tổng tiền.
- Giới hạn chiết khấu ở giao diện để dễ sử dụng; API vẫn phải tự kiểm tra để bảo vệ dữ liệu.

## 5. Chuẩn hóa giá bán theo đơn vị

- Tính giá vỉ/viên từ quy cách đóng gói của từng sản phẩm.
- Dùng cùng quy tắc quy đổi cho giá bán và số lượng tồn kho.
- Lưu đơn vị bán trên dòng hóa đơn để hóa đơn và hoàn trả giữ đúng ý nghĩa.

## Thứ tự ưu tiên

1. Phân quyền API.
2. Quy đổi tồn kho, hoàn trả và giá bán theo đơn vị.
3. OCR thực sự và bước dược sĩ xác nhận kết quả.
4. Giới hạn chiết khấu.

Mục quy đổi tồn kho và giá bán nên được triển khai cùng nhau vì cùng dựa trên quy cách đóng gói.
