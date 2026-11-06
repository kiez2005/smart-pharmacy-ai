# KẾ HOẠCH TRIỂN KHAI XỬ LÝ TOÀN DIỆN CÁC VẤN ĐỀ CODE REVIEW
> **Dự án**: PharmaCore Enterprise ERP — Hệ Thống Quản Trị Nhà Thuốc, POS & AI Lâm Sàng  
> **Tài liệu tham chiếu**: [CODE_REVIEW_RECOMMENDATIONS.md](./CODE_REVIEW_RECOMMENDATIONS.md) & [CODE_REVIEW_FIX_PLAN_CONTRADICTIONS.md](./CODE_REVIEW_FIX_PLAN_CONTRADICTIONS.md)  
> **Phiên bản**: 3.0 (Đã tháo gỡ triệt để toàn bộ 8 điểm mâu thuẫn kiến trúc & chốt thiết kế chi tiết)  
> **Ngày cập nhật**: 06/11/2026  
> **Trạng thái**: THIẾT KẾ HOÀN CHỈNH (PRODUCTION-READY ARCHITECTURE)  

---

## I. GIẢI QUYẾT TRIỆT ĐỂ 8 ĐIỂM MÂU THUẪN ĐÃ NOTE TRONG FIX PLAN

Căn cứ tài liệu đối chiếu [`CODE_REVIEW_FIX_PLAN_CONTRADICTIONS.md`](./CODE_REVIEW_FIX_PLAN_CONTRADICTIONS.md), hệ thống thống nhất và chốt dứt điểm giải pháp kỹ thuật cho từng điểm như sau:

---

### 1. Nguồn dữ liệu quy cách đóng gói (`PackagingSpec`)
- **Vấn đề đã note**: Không thể dùng từ điển hardcode 35 thuốc vì sẽ không hỗ trợ khi thêm/sửa thuốc mới; cần giữ nguyên 10 trường bắt buộc của bảng `Product` theo barem chấm điểm.
- **Giải pháp chuẩn hóa**:
  - Tạo model quan hệ 1-1 riêng trong Prisma Schema: `ProductPackaging`:
    ```prisma
    model ProductPackaging {
      PackagingID         Int      @id @default(autoincrement())
      ProductID           Int      @unique
      PackageUnit         String   // Đơn vị bao gói lớn nhất (VD: "Hộp", "Lọ", "Chai", "Tuýp")
      BlisterUnit         String?  // Đơn vị trung gian (VD: "Vỉ" nếu có)
      BlistersPerPackage  Int?     // Số vỉ trong 1 hộp (VD: 25)
      SmallestUnit        String   // Đơn vị nhỏ nhất có thể bán (VD: "Viên", "Gói", "Ống", "Chai")
      UnitsPerPackage     Int      @default(1) // Tổng số đơn vị nhỏ nhất trong 1 hộp (VD: 100 viên, 30 gói)
      UnitsPerBlister     Int?     // Số viên trong 1 vỉ (VD: 4 viên/vỉ)
      LooseUnits          Int      @default(0) // Số đơn vị nhỏ nhất lẻ dở dang đang mở trong kho
      AllowFractionalSale Boolean  @default(true) // Có cho phép bán lẻ vỉ/viên hay không

      product             Product  @relation(fields: [ProductID], references: [ProductID], onDelete: Cascade)
    }
    ```
  - **Lợi ích**:
    - Bảng `Product` giữ nguyên 100% đúng 10 trường chuẩn theo yêu cầu của bài tập lớn.
    - Dữ liệu quy cách được lưu quan hệ trong cơ sở dữ liệu SQLite, không phụ thuộc từ điển tĩnh.
    - Cập nhật Form Thêm/Sửa sản phẩm ở frontend: bổ sung các trường cấu hình quy cách đóng gói.
    - Tích hợp vào Export/Import Excel/JSON/XML và script `seed.ts` cho toàn bộ 35 sản phẩm ban đầu.

---

### 2. Quản lý tồn kho lẻ khi bán và hoàn trả (Xử lý hộp dở dang)
- **Vấn đề đã note**: Bán 11 viên mà trừ 1 hộp thì 89 viên còn lại đi đâu? Lần bán sau nếu tiếp tục trừ 1 hộp nữa sẽ làm mất thuốc và âm kho.
- **Giải pháp chuẩn hóa (Mô hình Quản lý Hộp dở dang - Open Package Inventory)**:
  - Sử dụng trường `ProductPackaging.LooseUnits` (Số viên/gói lẻ dở dang sau khi mở hộp):
  - **Luồng Bán lẻ 11 Viên Decolgen (Hộp 100 Viên, kho đang có 10 Hộp, `LooseUnits = 0`)**:
    1. Khách mua 11 Viên. Kiểm tra `LooseUnits = 0 < 11`.
    2. Hệ thống mở 1 hộp nguyên: `Product.Quantity` giảm 1 (từ 10 xuống 9 Hộp).
    3. Hộp mở ra được 100 Viên, trừ 11 Viên bán cho khách -> `LooseUnits` còn lại **89 Viên**.
    4. Bản ghi `InvoiceItem` lưu:
       - `Quantity = 11`
       - `Unit = "Viên"`
       - `UnitPrice = 1.200 đ/viên`
       - `BaseQuantityDeducted = 1` (Đã mở 1 hộp)
       - `LooseUnitsDeducted = 11` (Số viên lẻ thực tế lấy ra)
  - **Lần mua tiếp theo: Khách mua 9 Viên**:
    1. Kiểm tra `LooseUnits = 89 >= 9` -> Đủ thuốc trong hộp đang mở dở!
    2. Lấy trực tiếp từ thuốc lẻ: `LooseUnits` giảm từ 89 xuống 80 Viên.
    3. Tồn kho `Product.Quantity` **vẫn giữ nguyên 9 Hộp** (không mở thêm hộp mới).
    4. `BaseQuantityDeducted = 0`, `LooseUnitsDeducted = 9`.
  - **Luồng Hoàn trả hóa đơn 11 Viên**:
    1. Cộng trả lại 11 viên vào thuốc lẻ: `LooseUnits = 80 + 11 = 91 Viên`.
    2. Nếu `LooseUnits` cộng dồn đủ $\ge 100$ Viên (tròn 1 hộp) -> Tự động đóng gói lại thành 1 hộp nguyên: `Product.Quantity` tăng 1, `LooseUnits -= 100`.
    3. Kho hàng chính xác tuyệt đối đến từng viên thuốc, không bao giờ bị lệch hay làm tròn ảo!

---

### 3. Kế hoạch di trú hóa đơn cũ (Legacy Invoices Migration)
- **Vấn đề đã note**: Hóa đơn cũ không lưu giá/quy cách lúc lập; `BaseQuantityDeducted` không thể để mặc định `1` vì sẽ bị suy đoán sai.
- **Giải pháp chuẩn hóa**:
  - Trong `schema.prisma`, định nghĩa trường mới là **`nullable`**:
    ```prisma
    Unit                 String?  // Nullable
    BaseQuantityDeducted Int?     // Nullable (Không gán default 1)
    LooseUnitsDeducted   Int?     // Nullable
    ```
  - **Script Di trú (`scripts/migrate-legacy-invoices.ts`)**:
    - Quét các `InvoiceItem` có `BaseQuantityDeducted === null`:
      - **Trường hợp 1 (Xác minh được 100%)**: Nếu `UnitPrice` xấp xỉ `product.Price` (sai số $\le 1\%$) -> Chắc chắn bán nguyên đơn vị gốc (`Hộp`/`Chai`) -> Điền `Unit = product.Unit`, `BaseQuantityDeducted = Quantity`, `LooseUnitsDeducted = 0`.
      - **Trường hợp 2 (Không thể tự suy đoán)**: Nếu `UnitPrice` khác xa giá sản phẩm gốc -> Giữ nguyên `BaseQuantityDeducted = null` và đánh dấu `LegacyUnverified = true`.
  - **Luồng Hoàn trả hóa đơn cũ chưa xác minh**:
    - Nếu Dược sĩ bấm Hủy một hóa đơn cũ mà `BaseQuantityDeducted === null`:
    - API và Giao diện hiển thị hộp thoại xác nhận:
      > *"Hóa đơn này được lập trước khi hệ thống chuẩn hóa quy cách. Vui lòng Dược sĩ xác nhận số lượng hộp thực tế cần hoàn nhập kho: [ ... ] Hộp"*.
    - Dược sĩ xác nhận số lượng thực tế -> Hệ thống cộng kho đúng con số đó, tuyệt đối không tự động đoán bừa.

---

### 4. Lưu vết và Hoàn điểm tích lũy thành viên khi hủy đơn
- **Vấn đề đã note**: Cần lưu vết số điểm đã dùng và đã cộng trên hóa đơn; luồng hủy phải hoàn điểm an toàn và chỉ hoàn một lần.
- **Giải pháp chuẩn hóa**:
  - Mở rộng model `Invoice` trong `schema.prisma`:
    ```prisma
    model Invoice {
      // ... các trường hiện có ...
      UsedPoints      Int      @default(0) // Số điểm tích lũy đã dùng để trừ tiền
      PointsDiscount  Float    @default(0) // Số tiền giảm tương ứng (UsedPoints * 1000)
      PointsEarned    Int      @default(0) // Số điểm được tích lũy mới từ đơn hàng này
    }
    ```
  - **Luồng Tạo Hóa Đơn (`createInvoice`)**:
    - Kiểm tra `customer.LoyaltyPoints >= UsedPoints`.
    - Trừ điểm dùng: `customer.LoyaltyPoints -= UsedPoints`.
    - Cộng điểm tích lũy mới: `PointsEarned = Math.floor(finalTotal / 10000)`.
    - Cập nhật số dư điểm khách: `customer.LoyaltyPoints += PointsEarned`.
    - Lưu cả 3 trường `UsedPoints`, `PointsDiscount`, `PointsEarned` vào bản ghi `Invoice`.
  - **Luồng Hủy / Hoàn Hóa Đơn (`cancelInvoice`)**:
    - Kiểm tra trạng thái: `if (invoice.Status === 'REFUNDED') throw new Error('Hóa đơn này đã được hoàn trả trước đó');` -> **Đảm bảo chỉ hoàn 1 lần duy nhất (Idempotent)**.
    - Hoàn trả lại số điểm đã dùng cho khách: `customer.LoyaltyPoints += invoice.UsedPoints`.
    - Thu hồi số điểm đã thưởng: `customer.LoyaltyPoints = Math.max(0, customer.LoyaltyPoints - invoice.PointsEarned)`.
    - Toàn bộ được thực thi trong một `prisma.$transaction` duy nhất.

---

### 5. Ma trận phân quyền chi tiết (RBAC) khớp 100% Route thực tế
- **Vấn đề đã note**: Route nhân sự thực tế là `/api/enterprise/staff`, Contact có `PATCH /:id/reply`, các route chưa được liệt kê allowlist chi tiết.
- **Bảng Ma Trận Phân Quyền Thực Tế Toàn Diện**:

| Route thực tế | Method | Phân loại | Role cho phép | Nghiệp vụ cụ thể |
| :--- | :---: | :---: | :---: | :--- |
| `/api/health` | `GET` | **Public** | Mọi người | Kiểm tra trạng thái server |
| `/api/auth/register` | `POST` | **Public** | Mọi người | Đăng ký tài khoản (tạo `INACTIVE`) |
| `/api/auth/login` | `POST` | **Public** | Mọi người | Đăng nhập (từ chối `INACTIVE`) |
| `/api/auth/me` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Lấy thông tin phiên đăng nhập |
| `/api/contacts` | `POST` | **Public** | Mọi người | Khách gửi form tư vấn |
| `/api/contacts` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Dược sĩ xem danh sách thư tư vấn |
| `/api/contacts/:id/reply` | `PATCH` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Dược sĩ gửi phản hồi tư vấn |
| `/api/products` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh mục, phân trang, tìm kiếm |
| `/api/products/:id` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem chi tiết thuốc & thẻ kho |
| `/api/products` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Thêm thuốc mới kèm quy cách |
| `/api/products/:id` | `PUT` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Sửa thông tin thuốc & quy cách |
| `/api/products/:id/clone` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Nhân bản 1 sản phẩm |
| `/api/products/bulk-clone` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Nhân bản hàng loạt thuốc |
| `/api/products/import` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Import Excel / JSON / XML |
| `/api/products/export` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Export thuốc ra file |
| `/api/products/:id` | `DELETE`| **Cần JWT** | `ADMIN` | Xóa 1 sản phẩm thuốc |
| `/api/products/bulk-delete` | `POST` | **Cần JWT** | `ADMIN` | Xóa nhiều sản phẩm thuốc |
| `/api/invoices` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh sách hóa đơn |
| `/api/invoices` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xuất bán POS, trừ kho quy chuẩn |
| `/api/invoices/:id/cancel` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Hủy đơn, hoàn lại kho gốc & điểm |
| `/api/enterprise/dashboard` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem chỉ số doanh thu & kho |
| `/api/enterprise/products/:id/stock-card` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem thẻ kho chi tiết |
| `/api/enterprise/customers` | `GET`, `POST`, `PUT` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Quản lý hồ sơ bệnh nhân CRM |
| `/api/enterprise/suppliers` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh sách nhà cung cấp |
| `/api/enterprise/suppliers` | `POST`, `PUT` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Thêm, sửa nhà cung cấp |
| `/api/enterprise/purchase-orders` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh sách phiếu nhập kho |
| `/api/enterprise/purchase-orders` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Tạo phiếu nhập kho tăng tồn |
| `/api/enterprise/payments` | `GET` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Sổ quỹ & đối soát thanh toán |
| `/api/enterprise/staff` | `GET` | **Cần JWT** | `ADMIN` | Xem danh sách tài khoản nhân sự |
| `/api/enterprise/staff/:id/role` | `PATCH` | **Cần JWT** | `ADMIN` | Thay đổi quyền vai trò nhân viên |
| `/api/enterprise/staff/:id/status`| `PATCH` | **Cần JWT** | `ADMIN` | **Admin duyệt kích hoạt (`ACTIVE`/`INACTIVE`)** |
| `/api/enterprise/:entity/bulk-delete`| `POST`| **Cần JWT** | `ADMIN` | Xóa dữ liệu các bảng phụ |
| `/api/ai/ocr-prescription` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Quét ảnh OCR đơn thuốc |
| `/api/ai/diagnose-chat` | `POST` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Chatbot tư vấn dược lâm sàng |

---

### 6. Khép kín vòng đời Token ở Frontend (Frontend Token Lifecycle)
- **Vấn đề đã note**: `App.tsx` bỏ qua token, khởi tạo sẵn `ADMIN`, chưa lắng nghe sự kiện 401.
- **Giải pháp chuẩn hóa**:
  1. **Nơi lưu Token**: Trong `forms.api.ts` (và `AuthPage.tsx`):
     ```ts
     localStorage.setItem('pharmacore_token', res.token);
     localStorage.setItem('pharmacore_user', JSON.stringify(res.user));
     ```
  2. **Khởi tạo trạng thái trong `App.tsx`**:
     - Bỏ gán cứng `currentUser` ban đầu:
       ```ts
       const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
         const token = localStorage.getItem('pharmacore_token');
         const userStr = localStorage.getItem('pharmacore_user');
         if (token && userStr) {
           try { return JSON.parse(userStr); } catch { return null; }
         }
         return null;
       });
       ```
     - Nếu `currentUser === null`: Hiển thị Modal/Trang Đăng nhập bắt buộc (có nút hỗ trợ đăng nhập nhanh bằng tài khoản demo Admin để chấm bài thuận tiện).
  3. **Lắng nghe sự kiện hết hạn phiên (`401 Unauthorized`)**:
     - `apiClient.ts` phát custom event `window.dispatchEvent(new Event('pharmacore_unauthorized'))`.
     - Trong `App.tsx`:
       ```ts
       useEffect(() => {
         const handleUnauthorized = () => {
           setCurrentUser(null);
           toast.error('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại!');
         };
         window.addEventListener('pharmacore_unauthorized', handleUnauthorized);
         return () => window.removeEventListener('pharmacore_unauthorized', handleUnauthorized);
       }, []);
       ```

---

### 7. Thứ tự khởi tạo cấu hình Fail-Fast `JWT_SECRET`
- **Vấn đề đã note**: `index.ts` gọi `dotenv.config()` sau khi import controller, controller đã đọc `JWT_SECRET` trước lúc biến môi trường được nạp.
- **Giải pháp chuẩn hóa**:
  - Tạo module cấu hình độc lập duy nhất: `backend/src/config/env.ts`:
    ```ts
    import dotenv from 'dotenv';
    dotenv.config();

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
      console.error('================================================================');
      console.error('[CRITICAL SECURITY ERROR] Biến môi trường JWT_SECRET chưa được thiết lập!');
      console.error('Ứng dụng bắt buộc dừng khởi động ngay lập tức để bảo vệ hệ thống.');
      console.error('================================================================');
      process.exit(1);
    }

    export const JWT_SECRET = process.env.JWT_SECRET;
    export const PORT = Number(process.env.PORT) || 5000;
    ```
  - Mọi controller, middleware và file `index.ts` đều import `JWT_SECRET` từ `src/config/env.ts`. Điều này đảm bảo `dotenv.config()` luôn được thực thi trước tiên và kiểm tra fail-fast ngay lập tức trước khi server kịp lắng nghe request.

---

### 8. Tách biệt kết quả OCR Thô và Đối chiếu Danh mục kho
- **Vấn đề đã note**: Đơn thuốc có thể chứa thuốc hợp lệ nhưng nhà thuốc chưa nhập kho; không tìm thấy trong kho không đồng nghĩa với ảnh hỏng/không đọc được.
- **Giải pháp chuẩn hóa**:
  - Tách quy trình OCR thành **2 pha độc lập**:
    - **Pha 1: Nhận diện văn bản quang học (OCR Engine)**:
      - Trích xuất toàn bộ chuỗi văn bản thô từ ảnh (`raw_ocr_text`).
      - Tiêu chí từ chối ảnh lỗi: Chỉ báo lỗi khi văn bản trích xuất hoàn toàn rỗng, độ tin cậy $< 15\%$ hoặc toàn ký tự rác vô nghĩa (ảnh trắng, ảnh tối đen, ảnh phong cảnh).
    - **Pha 2: Đối chiếu ngữ nghĩa với Kho hàng (Stock Matching)**:
      - Phân tích tên thuốc và số lượng từ văn bản.
      - Tra cứu trong bảng `Product`:
        - **Thuốc có trong kho (`inStock = true`)**: Hiển thị thẻ màu xanh lá, hiển thị số lượng tồn kho khả dụng.
        - **Thuốc KHÔNG có trong kho (`inStock = false`, `matchedProduct = null`)**: Hiển thị thẻ cảnh báo màu vàng: *"Thuốc ngoài danh mục: [Tên thuốc trên đơn]"*.
  - **Giao diện Dược sĩ Phê duyệt trước khi chuyển sang POS**:
    - Với thuốc ngoài danh mục: Dược sĩ có thể chọn 1 thuốc tương đương có sẵn trong kho để thay thế, hoặc bấm Xóa bỏ dòng đó.
    - **Tuyệt đối không tự động nạp thuốc ngoài danh mục vào giỏ hàng POS**.

---

## II. MA TRẬN FILE THỰC THI

| STT | File | Hành động | Nội dung thay đổi |
| :---: | :--- | :---: | :--- |
| **1** | `backend/src/config/env.ts` | **Tạo mới** | Nạp `dotenv` trước tiên, fail-fast `process.exit(1)` nếu thiếu `JWT_SECRET` |
| **2** | `backend/src/index.ts` | Chỉnh sửa | Import từ `config/env.ts`, gắn router |
| **3** | `backend/prisma/schema.prisma` | Chỉnh sửa | Tạo model `ProductPackaging`, thêm `Unit?`, `BaseQuantityDeducted?`, `LooseUnitsDeducted?` vào `InvoiceItem`, thêm `UsedPoints`, `PointsDiscount`, `PointsEarned` vào `Invoice` |
| **4** | `backend/src/services/packaging.service.ts` | **Tạo mới** | Quản lý quy cách đóng gói và logic trừ/hoàn hộp dở dang (`LooseUnits`) |
| **5** | `backend/src/middlewares/auth.middleware.ts` | **Tạo mới** | `authenticateToken` và `requireRoles` |
| **6** | `backend/src/controllers/auth.controller.ts` | Chỉnh sửa | Đăng ký tạo `INACTIVE`, login từ chối `INACTIVE`, bỏ chọn Role |
| **7** | `backend/src/controllers/enterprise.controller.ts` | Chỉnh sửa | Thêm `updateStaffStatus` để Admin duyệt tài khoản |
| **8** | `backend/src/controllers/invoice.controller.ts` | Chỉnh sửa | Áp dụng trừ kho hộp dở dang, hoàn lại đúng kho gốc, quản lý điểm thành viên |
| **9** | `backend/src/controllers/ai.controller.ts` & `ai.service.ts` | Chỉnh sửa | Tách OCR thô và đối chiếu kho, xử lý từ chối ảnh lỗi thật |
| **10**| `backend/scripts/migrate-legacy-invoices.ts` | **Tạo mới** | Script di trú hóa đơn cũ an toàn |
| **11**| `frontend/src/services/apiClient.ts` | **Tạo mới** | Axios Interceptor tập trung xử lý Bearer Token và 401 |
| **12**| `frontend/src/App.tsx` | Chỉnh sửa | Khởi tạo phiên từ localStorage, lắng nghe 401, xóa hardcode Admin |
| **13**| `frontend/src/pages/PosTerminalPage.tsx` | Chỉnh sửa | Chọn đơn vị theo quy cách thực tế, nhập điểm thành viên, validate chiết khấu |
| **14**| `frontend/src/pages/PrescriptionOcrPage.tsx` | Chỉnh sửa | Phân định tab Demo vs Thật, bảng duyệt thuốc ngoài danh mục |

---

## III. BỘ 5 KỊCH BẢN KIỂM THỬ NGHIỆM THU CHI TIẾT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       5 TÌNH HUỐNG KIỂM THỬ BẮT BUỘC                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Đăng ký tài khoản mới -> INACTIVE -> Đăng nhập bị từ chối 403           │
│ 2. Bán 11 viên Decolgen -> Mở 1 hộp, lưu 89 viên lẻ -> Hủy hoàn lại đúng 10 │
│ 3. Chiết khấu lớn hơn tổng tiền hoặc âm -> Cả 2 phía từ chối lỗi 400        │
│ 4. Dùng điểm thành viên vượt quá số dư -> Từ chối; dùng hợp lệ -> trừ/hoàn │
│ 5. Tải ảnh trắng vào OCR -> Báo lỗi; ảnh có thuốc ngoài kho -> Cảnh báo vàng│
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Kịch bản 1 (Tài khoản chưa duyệt & Fail-Fast)**:
   - Đăng ký tài khoản mới -> Nhận `Status = INACTIVE`. Đăng nhập ngay -> Nhận lỗi 403. Admin duyệt sang `ACTIVE` -> Đăng nhập thành công.
   - Thử xóa `JWT_SECRET` trong `.env` -> Server crash ngay lập tức khi chạy lệnh khởi động.
2. **Kịch bản 2 (Bán 11 viên & Quản lý hộp dở dang)**:
   - Thuốc Decolgen (Hộp 100 viên) có 10 Hộp, `LooseUnits = 0`.
   - Bán 11 viên -> Kho giảm còn 9 Hộp, `LooseUnits = 89`.
   - Bán tiếp 9 viên -> Kho vẫn 9 Hộp, `LooseUnits = 80`.
   - Hủy hóa đơn 11 viên -> `LooseUnits = 80 + 11 = 91 Viên`, kho vẫn 9 Hộp. Nếu hủy tiếp hóa đơn 9 viên -> `LooseUnits = 91 + 9 = 100` -> Tự động đóng lại thành **10 Hộp nguyên**!
3. **Kịch bản 3 (Kiểm soát chiết khấu)**:
   - Đơn hàng 50.000 đ, nhập chiết khấu `-5.000 đ` hoặc `60.000 đ` -> API trả lỗi 400; POS hiển thị cảnh báo đỏ và chặn nút thanh toán.
4. **Kịch bản 4 (Điểm thành viên)**:
   - Khách có 20 điểm (20.000 đ), nhập dùng 30 điểm -> Bị từ chối lỗi 400.
   - Dùng 10 điểm -> Giảm 10.000 đ, điểm trong hồ sơ giảm còn 10 điểm.
   - Hủy đơn hàng -> Điểm được hoàn trả lại đúng 20 điểm ban đầu.
5. **Kịch bản 5 (OCR ảnh lỗi & Thuốc ngoài danh mục)**:
   - Tải ảnh trắng/mờ -> Báo lỗi: *"Không nhận dạng được văn bản từ ảnh"*, không trả về thuốc demo.
   - Quét đơn có thuốc ngoài danh mục -> Bảng duyệt đánh dấu vàng *"Thuốc ngoài danh mục"*. Bắt buộc Dược sĩ đổi thuốc hoặc xóa trước khi chuyển sang POS.

---

> Toàn bộ nội dung kế hoạch chuẩn hóa trên đã được đồng bộ vào file [`CODE_REVIEW_FIX_PLAN.md`](./CODE_REVIEW_FIX_PLAN.md).
