# KẾ HOẠCH TRIỂN KHAI XỬ LÝ TOÀN DIỆN CÁC VẤN ĐỀ CODE REVIEW
> **Dự án**: PharmaCore Enterprise ERP — Hệ Thống Quản Trị Nhà Thuốc, POS & AI Lâm Sàng  
> **Tài liệu tham chiếu**: [CODE_REVIEW_RECOMMENDATIONS.md](./CODE_REVIEW_RECOMMENDATIONS.md)  
> **Ngày lập kế hoạch**: 06/11/2026  
> **Trạng thái**: Đã phê duyệt kế hoạch — Sẵn sàng triển khai  

---

## I. TỔNG QUAN & THỨ TỰ ƯU TIÊN THỰC HIỆN

Căn cứ vào mức độ rủi ro đối với tính bảo mật, sự toàn vẹn dữ liệu kho và trải nghiệm vận hành thực tế tại nhà thuốc, kế hoạch được chia làm 4 giai đoạn theo đúng thứ tự ưu tiên:

```
[GIAI ĐOẠN 1] Phân quyền API & Khóa truy cập (Ưu tiên 1 - Cực kỳ khẩn cấp)
      │
      ▼
[GIAI ĐOẠN 2] Quy đổi tồn kho, Giá bán theo đơn vị & Hoàn trả (Ưu tiên 2 & 5 - Khẩn cấp)
      │
      ▼
[GIAI ĐOẠN 3] Giới hạn & Kiểm soát chiết khấu (Ưu tiên 4 - Trung bình)
      │
      ▼
[GIAI ĐOẠN 4] Luồng OCR thực tế & Bước Dược sĩ kiểm duyệt (Ưu tiên 3 - Nâng cao)
```

---

## II. BẢNG PHÂN TÍCH HIỆN TRẠNG & NGUYÊN NHÂN GỐC RỄ

| STT | Vấn đề trong Code Review | Hiện trạng trong Code Base | Nguyên nhân & Rủi ro |
| :---: | :--- | :--- | :--- |
| **1** | **Khóa quyền truy cập API** | - `POST /api/auth/register` cho phép body gửi trường `Role: "ADMIN"` tự do.<br>- Các routes (`/api/products`, `/api/invoices`, `/api/enterprise`) chưa gắn middleware xác thực JWT.<br>- Chưa kiểm tra cờ `Status !== 'ACTIVE'` khi đăng nhập. | Bất kỳ ai không có tài khoản cũng có thể gọi API xóa thuốc, tạo đơn, hoặc tự phong quyền ADMIN. |
| **2** | **Quy đổi tồn kho & Hoàn trả** | - Giả định cứng: 1 Hộp = 10 Vỉ = 100 Viên cho tất cả thuốc.<br>- Bảng `InvoiceItem` không lưu đơn vị tính của dòng mua và không lưu số lượng kho gốc đã trừ.<br>- Khi hoàn trả hóa đơn (`cancelInvoice`), code lấy trực tiếp `item.Quantity` cộng lại vào kho. | Mua 1 vỉ thì kho trừ 1 hộp, nhưng khi khách hủy đơn thì kho lại được cộng 1 vỉ (hoặc 10 hộp), làm sai lệch toàn bộ thẻ kho và sổ sách. |
| **3** | **Luồng OCR đơn thuốc** | - Khi tải ảnh bất kỳ (kể cả ảnh trắng/lỗi), backend tự rơi vào fallback trả về 4 thuốc demo cố định.<br>- Giao diện chuyển ngay danh sách sang POS mà không có bước cho dược sĩ kiểm tra, sửa lỗi nhận diện. | Không phải OCR thực; người dùng không phân biệt được đơn demo và đơn quét thật; rủi ro kê nhầm thuốc cho bệnh nhân. |
| **4** | **Giới hạn chiết khấu** | - Backend chỉ lấy `Math.max(0, subtotal - Discount)` mà không từ chối đơn khi `Discount > subtotal` hoặc `Discount < 0`.<br>- Ô nhập chiết khấu ở POS cho phép nhập số âm hoặc số lớn tùy ý. | Đơn hàng có thể có doanh thu âm, gian lận chiết khấu vượt giá trị hóa đơn. |
| **5** | **Chuẩn hóa giá bán theo đơn vị** | - Giá vỉ chia 10, nhưng giá viên chia 50 trong khi số lượng quy đổi lại chia 100.<br>- Không có quy tắc quy đổi chuẩn theo quy cách của từng sản phẩm. | Giá bán vỉ/viên bị lệch tỷ lệ giá trị so với số lượng tồn kho bị trừ. |

---

## III. KẾ HOẠCH TRIỂN KHAI CHI TIẾT TỪNG GIAI ĐOẠN

---

### GIAI ĐOẠN 1: KHÓA QUYỀN TRUY CẬP API & BẢO MẬT HỆ THỐNG (ƯU TIÊN 1)

#### 1.1. Chuẩn hóa API Đăng ký & Đăng nhập (`backend/src/controllers/auth.controller.ts`)
- **Loại bỏ quyền tự chọn Role**: Xóa bỏ `Role` khỏi `registerSchema`. Mọi tài khoản đăng ký mới qua endpoint công khai đều tự động được gán quyền thấp nhất:
  - Mặc định: `Role = "CASHIER"` (Nhân viên thu ngân / Bán lẻ cơ bản).
  - Chỉ duy nhất tài khoản `ADMIN` trong trang quản trị nhân sự mới có quyền thăng cấp phân quyền cho nhân sự.
- **Kiểm tra trạng thái tài khoản khi đăng nhập**:
  - Bổ sung điều kiện kiểm tra:
    ```ts
    if (user.Status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        message: 'Tài khoản của bạn đã bị vô hiệu hóa hoặc đang chờ quản trị viên kích hoạt',
      });
      return;
    }
    ```
- **Bắt buộc cấu hình `JWT_SECRET`**:
  - Kiểm tra biến môi trường `process.env.JWT_SECRET`. Nếu chạy trong môi trường production mà thiếu khóa bí mật, server sẽ từ chối khởi động để tránh rủi ro lộ khóa mặc định.

#### 1.2. Xây dựng Middleware Phân Quyền (`backend/src/middlewares/auth.middleware.ts`)
Tạo mới file middleware với 2 cơ chế kiểm soát:
1. `authenticateToken`:
   - Bóc tách token từ Header `Authorization: Bearer <token>`.
   - Xác thực chữ ký JWT, giải mã thông tin `{ UserID, Email, Role }`.
   - Nếu token thiếu hoặc không hợp lệ -> Trả về mã lỗi `401 Unauthorized`.
2. `requireRoles(allowedRoles: string[])`:
   - Kiểm tra `req.user.Role` có nằm trong danh sách quyền được phép thao tác hay không.
   - Nếu không đủ quyền -> Trả về mã lỗi `403 Forbidden` ("Bạn không có quyền thực hiện thao tác này").

#### 1.3. Áp dụng Phân Quyền Theo Từng Route Nghiệp Vụ
- **Route công khai (Public)**:
  - `POST /api/auth/login` (Đăng nhập)
  - `POST /api/auth/register` (Đăng ký)
  - `POST /api/contacts` (Khách gửi phản hồi/yêu cầu tư vấn)
  - `GET /api/health` (Kiểm tra trạng thái máy chủ)
- **Route yêu cầu đăng nhập (`authenticateToken`)**:
  - `GET /api/products` (Tra cứu danh mục thuốc - `ADMIN`, `PHARMACIST`, `CASHIER`)
  - `POST /api/invoices` (Lập hóa đơn xuất bán POS - `ADMIN`, `PHARMACIST`, `CASHIER`)
- **Route yêu cầu quyền Quản trị & Dược sĩ (`requireRoles(['ADMIN', 'PHARMACIST'])`)**:
  - Thêm mới, cập nhật, xóa đơn lẻ/hàng loạt sản phẩm (`POST/PUT/DELETE /api/products/*`)
  - Nhập/Xuất file Excel/JSON/XML danh mục thuốc
  - Hủy/Hoàn trả hóa đơn bán hàng (`POST /api/invoices/:id/cancel`)
  - Quản lý nhà cung cấp & Tạo phiếu nhập kho (`/api/enterprise/*`)
  - Bóc tách đơn thuốc OCR & Tư vấn dược lâm sàng (`/api/ai/*`)
- **Route chỉ dành riêng cho Quản trị viên tối cao (`requireRoles(['ADMIN'])`)**:
  - Quản lý danh sách nhân sự, kích hoạt/khóa tài khoản, thay đổi quyền hạn.

#### 1.4. Cấu hình Frontend Axios Interceptor (`frontend/src/services/apiClient.ts`)
- Tạo một instance Axios dùng chung cho toàn bộ frontend:
  - **Request Interceptor**: Tự động lấy token từ `localStorage.getItem('pharmacore_token')` và gắn vào header `Authorization: Bearer <token>`.
  - **Response Interceptor**: Bắt lỗi `401 Unauthorized` để thông báo phiên đăng nhập hết hạn và kích hoạt Modal Đăng nhập.

---

### GIAI ĐOẠN 2 & 5: QUY ĐỔI TỒN KHO, GIÁ BÁN THEO ĐƠN VỊ & HOÀN TRẢ (ƯU TIÊN 2 & 5)

#### 2.1. Cập nhật Cơ sở dữ liệu (`backend/prisma/schema.prisma`)
Mở rộng bảng `InvoiceItem` để lưu giữ thông tin chi tiết đơn vị bán thực tế:
```prisma
model InvoiceItem {
  ItemID               Int      @id @default(autoincrement())
  InvoiceID            Int
  ProductID            Int
  Quantity             Int      @default(1) // Số lượng khách mua (VD: 2)
  Unit                 String   @default("Hộp") // Đơn vị khách mua (Hộp, Vỉ, Viên, Gói, Chai)
  UnitPrice            Float    @default(0) // Đơn giá tương ứng của đơn vị mua
  BaseQuantityDeducted Int      @default(1) // Số lượng đơn vị gốc đã trừ trong Product.Quantity
  DosageNote           String?

  invoice              Invoice  @relation(fields: [InvoiceID], references: [InvoiceID], onDelete: Cascade)
  product              Product  @relation(fields: [ProductID], references: [ProductID], onDelete: Restrict)
}
```
*Chạy lệnh `npx prisma db push` để cập nhật cấu trúc database mà không làm mất 10 trường chuẩn của bảng `Product`.*

#### 2.2. Xây dựng Module Quy Chuẩn Quy Cách Đóng Gói (`backend/src/services/packaging.service.ts`)
Tạo module dùng chung duy nhất để xử lý quy cách của từng sản phẩm:
- **Hàm `parsePackagingSpec(product)`**:
  - Phân tích thông tin quy cách từ tên và mô tả sản phẩm (hoặc từ từ điển dược phẩm):
    - `Decolgen Forte (Hộp 25 vỉ)`: Đơn vị gốc = Hộp, 25 Vỉ/Hộp, 4 Viên/Vỉ (Tổng 100 Viên/Hộp).
    - `Smecta (Hộp 30 gói)`: Đơn vị gốc = Hộp, 30 Gói/Hộp (Không bán viên).
    - `Siro Ho Prospan (Chai 100ml)`: Đơn vị gốc = Chai (Không có vỉ/viên).
    - `Tiffy Dey (Vỉ 4 viên)`: Đơn vị gốc = Vỉ, 4 Viên/Vỉ.
    - `Berberin (Lọ 100 viên)`: Đơn vị gốc = Lọ, 100 Viên/Lọ.
  - Trả về danh sách đơn vị hợp lệ (`allowedUnits`) kèm hệ số quy đổi so với đơn vị gốc (`conversionFactor`).
- **Hàm dùng chung `calculateDeductionAndPrice(product, unit, quantity)`**:
  - **Đồng bộ giá bán**: `UnitPrice = Math.round(product.Price * conversionFactor)`.
  - **Đồng bộ lượng trừ kho**: 
    - Nếu đơn vị mua là đơn vị gốc (Hộp/Chai) -> Trừ đúng `quantity`.
    - Nếu đơn vị mua là đơn vị con (Vỉ/Viên/Gói) -> Tính tổng đơn vị gốc tương đương và làm tròn trên (`Math.ceil(quantity / spec.itemsPerBox)`), kiểm tra số lượng dư nếu bán lẻ.
  - Đảm bảo **dùng chung một quy tắc 100%** giữa tính giá và tính lượng trừ kho.

#### 2.3. Cập nhật Logic Tạo Hóa Đơn (`createInvoice`)
- Khi lập hóa đơn: Gọi `calculateDeductionAndPrice` để lấy `unitPrice` và `baseDeduction`.
- Kiểm tra số lượng tồn kho `product.Quantity` có đủ đáp ứng `baseDeduction` không.
- Lưu chính xác `Unit`, `Quantity`, `UnitPrice`, `BaseQuantityDeducted` vào bản ghi `InvoiceItem`.

#### 2.4. Sửa Triệt Để Logic Hoàn Trả / Hủy Đơn Hàng (`cancelInvoice`)
- Thay thế hoàn toàn đoạn code cũ:
  ```ts
  // TRƯỚC (SAI): Cộng ngược item.Quantity làm sai lệch kho
  // data: { Quantity: { increment: item.Quantity } }
  
  // SAU (CHUẨN): Cộng hoàn lại đúng lượng tồn kho gốc đã bị trừ
  for (const item of invoice.items) {
    await tx.product.update({
      where: { ProductID: item.ProductID },
      data: { Quantity: { increment: item.BaseQuantityDeducted } },
    });
  }
  ```
- Kết quả: Khi khách trả lại 1 vỉ hoặc 5 viên, kho chỉ hoàn đúng lượng tồn kho gốc tương ứng, giải quyết dứt điểm vấn đề âm thuốc hoặc lạm phát tồn kho ảo.

#### 2.5. Đồng Bộ Giao Diện POS Terminal & Hóa Đơn
- Tại màn hình quầy thu ngân POS: Nút chọn đơn vị (`Hộp`, `Vỉ`, `Viên`) chỉ hiển thị những đơn vị hợp lệ theo quy cách thực tế của sản phẩm.
- Khi người dùng đổi đơn vị: Giá tiền trên giỏ hàng tự động cập nhật theo đơn giá quy chuẩn của đơn vị đó.
- Trang Hóa đơn (`InvoicesManagementPage`): Hiển thị rõ cột Đơn vị tính (`Hộp`/`Vỉ`/`Viên`) và thông tin lượng trừ kho gốc.

---

### GIAI ĐOẠN 3: GIỚI HẠN & KIỂM SOÁT CHIẾT KHẤU (ƯU TIÊN 4)

#### 3.1. Ràng Buộc Nghiêm Ngặt ở Backend (`createInvoice`)
- Tính toán tổng tiền hàng trước chiết khấu (`subtotal`) dựa trên đơn giá chuẩn từ cơ sở dữ liệu.
- Ràng buộc giá trị chiết khấu:
  ```ts
  if (Discount < 0) {
    throw new Error('Số tiền chiết khấu không được là số âm');
  }
  if (Discount > subtotal) {
    throw new Error(
      `Chiết khấu (${Discount.toLocaleString('vi-VN')} đ) không được vượt quá tổng giá trị đơn hàng (${subtotal.toLocaleString('vi-VN')} đ)`
    );
  }
  ```
- Đảm bảo doanh thu thực thu (`finalTotal = subtotal - Discount`) luôn luôn $\ge 0$.

#### 3.2. Kiểm Soát & Hỗ Trợ Người Dùng ở Giao Diện POS (`PosTerminalPage.tsx`)
- Thêm thuộc tính giới hạn vào ô nhập chiết khấu:
  - `min={0}`
  - `max={subTotal}`
- Tự động cảnh báo đỏ nếu người dùng gõ số tiền lớn hơn tổng tiền hàng.
- Bổ sung tùy chọn chọn chiết khấu nhanh theo % (`0%`, `5%`, `10%`) bên cạnh nhập số tiền tuyệt đối (VNĐ).

---

### GIAI ĐOẠN 4: LÀM RÕ & SỬA LUỒNG OCR ĐƠN THUỐC (ƯU TIÊN 3)

#### 4.1. Đánh Dấu Minh Bạch Dữ Liệu Demo (Presets)
- Trên giao diện [`PrescriptionOcrPage.tsx`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/frontend/src/pages/PrescriptionOcrPage.tsx):
  - Phân tách rõ ràng giữa 2 khu vực:
    1. **Tab 1: Mẫu Đơn Thuốc Bệnh Viện Mẫu (Preset Demo)**: Có nhãn màu hổ phách hiển thị rõ `[DỮ LIỆU DEMO THỰC THI THỬ NGHIỆM]`.
    2. **Tab 2: Tải Ảnh Chụp Đơn Thuốc Thật (Real Image Upload)**: Dành cho ảnh chụp từ camera hoặc file từ máy tính.

#### 4.2. Tích Hợp Nhận Dạng Ký Tự Quang Học Thực Thụ (Real OCR Engine)
- Tích hợp thư viện `tesseract.js` (hoặc Python Tesseract/EasyOCR trong microservice):
  - Đọc ma trận ảnh thật -> Lọc nhị phân Adaptive Threshold -> Trích xuất chuỗi ký tự thô (`raw text`).
- **Xử lý khi ảnh không đọc được**:
  - Nếu ảnh mờ, độ tương phản quá thấp, hoặc không nhận diện được bất kỳ từ khóa thuốc nào:
    - **Không được tự ý trả về danh sách thuốc mẫu**.
    - Trả về mã thông báo lỗi rõ ràng: `"Không thể nhận dạng chữ trên ảnh đơn thuốc. Vui lòng chụp lại ảnh rõ nét, đủ ánh sáng hoặc chọn mẫu đơn thử nghiệm."`

#### 4.3. Bổ Sung Bước Dược Sĩ Kiểm Tra & Hiệu Chỉnh (Review Step) Trước Khi Sang POS
- Sau khi hệ thống bóc tách xong các dòng thuốc từ ảnh:
  - Hiển thị bảng kết quả cho phép Dược sĩ thao tác trực tiếp:
    1. **Tên thuốc đã khớp**: Dropdown cho phép dược sĩ chọn lại nếu hệ thống khớp nhầm.
    2. **Số lượng & Đơn vị**: Ô nhập cho phép dược sĩ điều chỉnh số lượng theo đúng chỉ định bác sĩ.
    3. **Hướng dẫn liều dùng**: Cho phép chỉnh sửa ghi chú cách dùng.
    4. **Nút xóa dòng**: Loại bỏ các dòng rác nhận diện sai.
    5. **Nút thêm thuốc**: Bổ sung thuốc nếu đơn thuốc còn thiếu.
- Thêm nút hành động: **`"Xác nhận đơn thuốc & Chuyển sang POS"`**. Chỉ khi dược sĩ bấm nút này, danh sách đã kiểm duyệt mới được nạp vào giỏ hàng POS để tiến hành thanh toán.

---

## IV. MA TRẬN FILE THAY ĐỔI & TẠO MỚI

| Phân hệ | Đường dẫn File | Loại thay đổi | Trách nhiệm chính |
| :--- | :--- | :---: | :--- |
| **Bảo mật & Auth** | `backend/src/middlewares/auth.middleware.ts` | **Tạo mới** | JWT token authentication & Role-based Access Control (RBAC) |
| | `backend/src/controllers/auth.controller.ts` | **Chỉnh sửa** | Bỏ chọn Role khi đăng ký, check `Status === ACTIVE`, check JWT Secret |
| | `backend/src/routes/product.routes.ts` | **Chỉnh sửa** | Gắn middleware bảo vệ CRUD sản phẩm |
| | `backend/src/routes/invoice.routes.ts` | **Chỉnh sửa** | Gắn middleware bảo vệ tạo đơn & hủy đơn |
| | `backend/src/routes/enterprise.routes.ts` | **Chỉnh sửa** | Gắn middleware bảo vệ quản lý kho và NCC |
| | `backend/src/routes/ai.routes.ts` | **Chỉnh sửa** | Gắn middleware bảo vệ endpoint AI OCR |
| | `frontend/src/services/apiClient.ts` | **Tạo mới** | Axios interceptor đính kèm JWT header và xử lý 401 |
| **Quy đổi kho & Đơn vị** | `backend/prisma/schema.prisma` | **Chỉnh sửa** | Thêm trường `Unit`, `BaseQuantityDeducted` vào `InvoiceItem` |
| | `backend/src/services/packaging.service.ts` | **Tạo mới** | Quy chuẩn quy cách đóng gói, hàm tính giá & trừ kho dùng chung |
| | `backend/src/controllers/invoice.controller.ts` | **Chỉnh sửa** | Áp dụng trừ kho quy chuẩn, sửa hoàn trả kho gốc, chặn chiết khấu > subtotal |
| | `frontend/src/pages/PosTerminalPage.tsx` | **Chỉnh sửa** | Chọn đơn vị theo quy cách thực, validate chiết khấu không âm/vượt tổng |
| | `frontend/src/pages/InvoicesManagementPage.tsx`| **Chỉnh sửa** | Hiển thị đơn vị mua và số lượng quy đổi trong hóa đơn |
| **Luồng OCR** | `backend/src/services/ai.service.ts` | **Chỉnh sửa** | Tích hợp OCR thực, từ chối ảnh rác/mờ, phân định rõ demo fallback |
| | `frontend/src/pages/PrescriptionOcrPage.tsx` | **Chỉnh sửa** | Gắn huy hiệu demo, thêm bảng dược sĩ soát/sửa đơn trước khi chuyển POS |

---

## V. KẾ HOẠCH KIỂM THỬ & TIÊU CHUẨN NGHIỆM THU (TEST CRITERIA)

### 1. Kiểm thử Phân quyền & Bảo mật (Giai đoạn 1)
- [ ] Gửi request `POST /api/auth/register` có kèm `Role: "ADMIN"` -> Kiểm tra trong DB: Tài khoản tạo ra chỉ có quyền `CASHIER`.
- [ ] Cập nhật tài khoản sang `Status: "INACTIVE"` -> Đăng nhập phải nhận thông báo lỗi 403.
- [ ] Gửi request `DELETE /api/products/1` mà không truyền Token -> Nhận mã lỗi `401 Unauthorized`.
- [ ] Đăng nhập tài khoản quyền `CASHIER` rồi gọi `DELETE /api/products/1` -> Nhận mã lỗi `403 Forbidden`.
- [ ] Đăng nhập tài khoản `ADMIN` / `PHARMACIST` -> Thực hiện CRUD thành công.

### 2. Kiểm thử Quy đổi tồn kho & Hoàn trả (Giai đoạn 2 & 5)
- [ ] Sản phẩm `Decolgen (Hộp 25 vỉ)` có tồn kho 10 Hộp, giá 120.000 đ/Hộp:
  - Chọn bán 1 Vỉ: Giá bán phải là 4.800 đ. Tồn kho trừ tương ứng.
  - Chọn bán 25 Vỉ: Giá bán là 120.000 đ, trừ đúng 1 Hộp tồn kho.
- [ ] Hủy hóa đơn (Hoàn trả):
  - Hóa đơn mua 2 Vỉ: Khi bấm Hoàn trả, kho được hoàn lại đúng lượng trừ ban đầu, tuyệt đối không được cộng thêm 2 Hộp vào kho.
- [ ] Sản phẩm dạng chai nước muối sinh lý / siro: Giao diện POS không hiển thị nút bán theo vỉ/viên.

### 3. Kiểm thử Chiết khấu (Giai đoạn 3)
- [ ] Nhập chiết khấu âm (VD: `-50.000 đ`) -> Backend từ chối với lỗi 400.
- [ ] Đơn hàng có tổng tiền 100.000 đ, nhập chiết khấu `150.000 đ`:
  - Frontend: Chặn không cho nhập hoặc hiển thị cảnh báo đỏ.
  - Backend: Báo lỗi `400 Bad Request` ("Chiết khấu không được vượt quá tổng tiền").

### 4. Kiểm thử OCR & Kiểm duyệt (Giai đoạn 4)
- [ ] Tải lên 1 bức ảnh trắng hoặc ảnh phong cảnh không có chữ -> Hệ thống báo lỗi ảnh không hợp lệ, không tự ý nạp đơn demo.
- [ ] Chạy đơn mẫu Demo -> Hiển thị huy hiệu `[DỮ LIỆU DEMO]`.
- [ ] Kết quả bóc tách hiển thị trên bảng: Cho phép Dược sĩ sửa tên thuốc, tăng giảm số lượng, thay đổi liều dùng -> Bấm "Chuyển sang POS" -> Giỏ hàng POS nhận đúng dữ liệu sau khi sửa.

---

> Toàn bộ kế hoạch trên đã được lưu vào file [`CODE_REVIEW_FIX_PLAN.md`](./CODE_REVIEW_FIX_PLAN.md). Quá trình triển khai sẽ được thực hiện tuần tự và kiểm thử nghiêm ngặt theo từng giai đoạn.
