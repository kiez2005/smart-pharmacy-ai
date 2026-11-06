# KẾ HOẠCH TRIỂN KHAI XỬ LÝ TOÀN DIỆN CÁC VẤN ĐỀ CODE REVIEW
> **Dự án**: PharmaCore Enterprise ERP — Hệ Thống Quản Trị Nhà Thuốc, POS & AI Lâm Sàng  
> **Tài liệu tham chiếu**: [CODE_REVIEW_RECOMMENDATIONS.md](./CODE_REVIEW_RECOMMENDATIONS.md)  
> **Phiên bản**: 2.0 (Đã chốt toàn bộ quy tắc nghiệp vụ & tiêu chuẩn kiểm chứng)  
> **Ngày cập nhật**: 06/11/2026  
> **Trạng thái**: ĐÃ CHỐT THIẾT KẾ (FINALIZED) — SẴN SÀNG TRIỂN KHAI  

---

## I. CÁC QUYẾT ĐỊNH NGHIỆP VỤ & KIẾN TRÚC ĐÃ CHỐT

Căn cứ phản hồi và đánh giá rủi ro thực tế, hệ thống chốt dứt điểm các nguyên tắc kiến trúc sau:

### 1. Phân quyền & Quản lý tài khoản (RBAC & Security)
- **Quy tắc đăng ký tài khoản mới**: Mọi tài khoản đăng ký qua form công khai đều được gán `Role = "CASHIER"` và trạng thái **`Status = "INACTIVE"` (Chờ Admin phê duyệt)**.
- **Quy tắc đăng nhập**: API `/api/auth/login` **bắt buộc từ chối** tài khoản có `Status !== "ACTIVE"` với thông báo: *"Tài khoản của bạn đang chờ Quản trị viên kích hoạt hoặc đã bị khóa"*.
- **Cấu hình `JWT_SECRET` (Fail-Fast)**: Ứng dụng **dừng khởi động ngay lập tức (`process.exit(1)`)** nếu biến môi trường `JWT_SECRET` bị thiếu hoặc để rỗng, tuyệt đối không dùng chuỗi hardcode ngầm trong mã nguồn.
- **Cơ chế gửi Token ở Frontend**: Toàn bộ request từ client sử dụng một Axios Request Interceptor duy nhất để tự động đính kèm `Authorization: Bearer <token>` từ `localStorage`. Nếu nhận mã phản hồi `401 Unauthorized`, hệ thống tự động xóa token và chuyển hướng về modal đăng nhập.

### 2. Quy đổi tồn kho, Giá bán theo đơn vị & Xử lý hóa đơn cũ (Stock & Legacy Invoices)
- **Quy cách đóng gói sản phẩm**: Bổ sung dữ liệu cấu trúc quy cách (`PackagingSpec`) cho từng sản phẩm: Đơn vị cơ sở (`BaseUnit`: Hộp/Chai/Lọ), Quy cách đóng gói con (`blisterPerBox`, `pillsPerBlister`, `pillsPerBox`), và danh sách đơn vị được phép bán lẻ kèm hệ số quy đổi chuẩn xác.
- **Lưu trữ trên dòng hóa đơn**: Mỗi bản ghi `InvoiceItem` bắt buộc lưu:
  - `Unit`: Đơn vị thực tế mà khách hàng chọn mua (`Hộp`, `Vỉ`, `Viên`, `Chai`, `Gói`...).
  - `Quantity`: Số lượng mua theo đơn vị đó.
  - `UnitPrice`: Đơn giá chuẩn hóa tương ứng của đơn vị đó.
  - `BaseQuantityDeducted`: Số lượng tồn kho gốc (tính theo `Product.Unit`) đã bị trừ khỏi kho.
- **Xử lý hóa đơn cũ (Legacy Invoices Strategy)**:
  - Viết script migration cập nhật dữ liệu lịch sử: Với các dòng `InvoiceItem` cũ chưa có `BaseQuantityDeducted` và `Unit`:
    - Nếu đơn giá xấp xỉ giá gốc sản phẩm -> Gán `Unit = product.Unit`, `BaseQuantityDeducted = Quantity`.
    - Nếu đơn giá nhỏ hơn và tương đương giá vỉ/viên -> Nội suy quy cách của sản phẩm tại thời điểm đó để điền chính xác `BaseQuantityDeducted`.
  - Khi hoàn trả (`cancelInvoice`): Luôn ưu tiên dùng `BaseQuantityDeducted`. Nếu là hóa đơn cũ chưa thể nội suy an toàn, hệ thống ghi log cảnh báo và chỉ hoàn trả theo đúng số lượng đơn vị cơ sở đã được xác minh.

### 3. Tiêu chí nghiệm thu luồng OCR đơn thuốc
- **Tiêu chí 1 (Ảnh thật)**: Quét ảnh chụp thật từ máy tính/camera **tuyệt đối không được trả về kết quả đơn mẫu demo**.
- **Tiêu chí 2 (Xử lý lỗi)**: Ảnh không đọc được (ảnh trắng, ảnh mờ, ảnh chụp phong cảnh, độ tin cậy thấp) **bắt buộc phải trả về lỗi từ chối và yêu cầu người dùng chụp lại**, không được tự ý gán thuốc ngầm.
- **Tiêu chí 3 (Dược sĩ kiểm duyệt)**: Kết quả bóc tách OCR bắt buộc phải dừng ở bước trung gian cho phép Dược sĩ kiểm tra lại tên thuốc, sửa số lượng, đổi đơn vị và sửa liều dùng. Chỉ khi Dược sĩ bấm **"Xác nhận & Chuyển sang POS"** thì dữ liệu mới được nạp vào giỏ hàng POS.

### 4. Ràng buộc Chiết khấu & Điểm tích lũy thành viên
- **Bản chất của Chiết khấu**:
  - `Discount`: Số tiền giảm giá trực tiếp tính bằng **VNĐ**.
  - `UsedPoints`: Số điểm thành viên tích lũy mà khách hàng muốn quy đổi (Tỷ lệ quy đổi chuẩn: **1 Điểm = 1.000 VNĐ**).
- **Ràng buộc kiểm tra ở Backend**:
  - Nếu hóa đơn có dùng điểm (`UsedPoints > 0`): API bắt buộc kiểm tra `customer.LoyaltyPoints >= UsedPoints`. Nếu khách không đủ điểm -> Từ chối lập đơn (lỗi 400).
  - Tổng số tiền giảm giá từ điểm và chiết khấu trực tiếp: `TotalDiscount = Discount + (UsedPoints * 1000)`.
  - Ràng buộc: `0 <= TotalDiscount <= Subtotal` (Tổng tiền hàng tính theo giá database). Nếu `TotalDiscount > Subtotal` -> Từ chối lập đơn.
- **Bảo toàn giao dịch (ACID Transaction)**:
  - Khi tạo đơn thành công: Trừ `UsedPoints` khỏi tài khoản khách hàng, đồng thời tích lũy điểm mới từ số tiền thực thanh toán (`finalTotal / 10000`).
  - Khi hủy/hoàn trả hóa đơn: Hoàn trả lại đầy đủ số `UsedPoints` cho khách và thu hồi số điểm thưởng đã cộng thêm.

---

## II. DANH SÁCH PHÂN CHIA ROUTE & CƠ CHẾ GỬI TOKEN

### 1. Bảng phân quyền chi tiết các Endpoint API Backend

| Nhóm API | Phương thức & URL | Mức độ bảo vệ | Quyền hạn cho phép (Roles) | Mô tả nghiệp vụ |
| :--- | :--- | :---: | :---: | :--- |
| **Hệ thống & Health** | `GET /api/health` | **Public** | Mọi người | Kiểm tra trạng thái máy chủ & DB |
| **Xác thực (Auth)** | `POST /api/auth/register` | **Public** | Mọi người | Đăng ký tài khoản (tạo `INACTIVE`) |
| | `POST /api/auth/login` | **Public** | Mọi người | Đăng nhập (từ chối `INACTIVE`) |
| | `GET /api/auth/me` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Lấy thông tin cá nhân hiện tại |
| | `GET/PUT /api/auth/users/*` | **Cần JWT** | `ADMIN` | Quản lý nhân sự, kích hoạt tài khoản |
| **Danh mục thuốc** | `GET /api/products` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh mục, tìm kiếm, phân trang |
| | `GET /api/products/:id` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem chi tiết thông tin thuốc & thẻ kho |
| | `POST/PUT /api/products/*` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Thêm mới, cập nhật thông tin thuốc |
| | `DELETE /api/products/*` | **Cần JWT** | `ADMIN` | Xóa đơn lẻ hoặc xóa hàng loạt thuốc |
| | `POST /api/products/import` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Nhập file thuốc Excel, JSON, XML |
| | `GET /api/products/export` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Xuất danh mục thuốc ra file |
| **Bán lẻ POS & Hóa đơn**| `POST /api/invoices` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xuất bán lẻ, trừ kho theo quy cách |
| | `GET /api/invoices` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Xem danh sách & lịch sử hóa đơn |
| | `POST /api/invoices/:id/cancel`| **Cần JWT** | `ADMIN`, `PHARMACIST` | Hoàn trả hóa đơn, cộng lại kho gốc |
| **Nhập kho & NCC** | `GET /api/enterprise/*` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Tra cứu NCC, chứng từ phiếu nhập |
| | `POST /api/enterprise/*` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Lập phiếu nhập kho, thêm mới NCC |
| **Khách hàng CRM** | `GET /api/enterprise/customers`| **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Tra cứu bệnh nhân, tiền sử dị ứng |
| | `POST /api/enterprise/customers`| **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Đăng ký hồ sơ bệnh nhân mới |
| **AI Lâm sàng & OCR** | `POST /api/ai/ocr-prescription`| **Cần JWT** | `ADMIN`, `PHARMACIST` | Nhận diện đơn thuốc OCR |
| | `POST /api/ai/diagnose-chat` | **Cần JWT** | `ADMIN`, `PHARMACIST`, `CASHIER` | Trợ lý tư vấn phác đồ lâm sàng |
| **Liên hệ & CSKH** | `POST /api/contacts` | **Public** | Mọi người | Khách hàng gửi liên hệ/tư vấn |
| | `GET/PUT /api/contacts/*` | **Cần JWT** | `ADMIN`, `PHARMACIST` | Dược sĩ duyệt & phản hồi thư tư vấn |

### 2. Cơ chế Frontend gửi Token & Quản lý phiên làm việc
- Toàn bộ dịch vụ Frontend sử dụng một file client duy nhất [`apiClient.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/frontend/src/services/apiClient.ts):
  ```ts
  apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('pharmacore_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('pharmacore_token');
        localStorage.removeItem('pharmacore_user');
        window.dispatchEvent(new Event('pharmacore_unauthorized'));
      }
      return Promise.reject(error);
    }
  );
  ```

---

## III. KẾ HOẠCH TRIỂN KHAI KỸ THUẬT CHI TIẾT

---

### GIAI ĐOẠN 1: BẢO MẬT, KHÓA TRUY CẬP & PHÂN QUYỀN RBAC (ƯU TIÊN 1)

1. **Khởi tạo Fail-Fast cấu hình môi trường ([`index.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/index.ts)):**
   ```ts
   if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
     console.error('[CRITICAL SECURITY ERROR] Biến môi trường JWT_SECRET chưa được thiết lập!');
     console.error('Hệ thống dừng khởi động để bảo đảm an toàn dữ liệu.');
     process.exit(1);
   }
   ```
2. **Cập nhật đăng ký & từ chối tài khoản INACTIVE ([`auth.controller.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/controllers/auth.controller.ts)):**
   - Đăng ký: Bỏ trường `Role` khỏi `registerSchema`. Luôn lưu bản ghi mới với `Role: "CASHIER"` và `Status: "INACTIVE"`. Không sinh JWT trả về ngay lúc đăng ký mà thông báo: *"Đăng ký thành công! Tài khoản đang ở trạng thái chờ Quản trị viên duyệt kích hoạt."*
   - Đăng nhập: Khi mật khẩu khớp, kiểm tra `if (user.Status !== 'ACTIVE')` -> trả mã `403 Forbidden`.
   - Seed dữ liệu: Tài khoản quản trị viên mặc định `DS. Nguyễn Văn Trung (ADMIN)` luôn có trạng thái `ACTIVE` để hệ thống vận hành trơn tru.
3. **Xây dựng Middleware xác thực ([`auth.middleware.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/middlewares/auth.middleware.ts)):**
   - Viết `authenticateToken` giải mã `Bearer <token>`.
   - Viết `requireRoles(['ADMIN', 'PHARMACIST'])` kiểm tra phân quyền.
4. **Gắn middleware lên các Router:**
   - Bảo vệ toàn bộ endpoint trong `product.routes.ts`, `invoice.routes.ts`, `enterprise.routes.ts`, `ai.routes.ts`.
5. **Cấu hình `apiClient.ts` ở Frontend:**
   - Thay thế toàn bộ các instance `axios.create` rải rác bằng `apiClient`.

---

### GIAI ĐOẠN 2 & 5: QUY CÁCH ĐÓNG GÓI, QUY ĐỔI TỒN KHO & HOÀN TRẢ (ƯU TIÊN 2 & 5)

1. **Cập nhật Prisma Schema & Đồng bộ DB ([`schema.prisma`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/prisma/schema.prisma)):**
   ```prisma
   model InvoiceItem {
     ItemID               Int      @id @default(autoincrement())
     InvoiceID            Int
     ProductID            Int
     Quantity             Int      @default(1)
     Unit                 String   @default("Hộp")
     UnitPrice            Float    @default(0)
     BaseQuantityDeducted Int      @default(1)
     DosageNote           String?

     invoice              Invoice  @relation(fields: [InvoiceID], references: [InvoiceID], onDelete: Cascade)
     product              Product  @relation(fields: [ProductID], references: [ProductID], onDelete: Restrict)
   }
   ```
   *Chạy `npx prisma db push`.*
2. **Xây dựng Module Quy Cách & Quy Đổi Dùng Chung ([`packaging.service.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/services/packaging.service.ts)):**
   - Định nghĩa từ điển quy cách đóng gói cho 35 danh mục dược phẩm:
     - `Panadol Extra`: Hộp 15 Vỉ x 12 Viên = 180 Viên/Hộp.
     - `Decolgen Forte`: Hộp 25 Vỉ x 4 Viên = 100 Viên/Hộp.
     - `Tiffy Dey`: Vỉ 4 Viên (Đơn vị gốc là Vỉ, 4 viên/vỉ).
     - `Berberin`: Lọ 100 Viên (Đơn vị gốc là Lọ, 100 viên/lọ).
     - `Smecta`: Hộp 30 Gói (Đơn vị gốc là Hộp, 30 gói/hộp, không có vỉ/viên).
     - `Siro Ho Prospan` / `Natri Clorid`: Chai (Chỉ bán chai, không có vỉ/viên).
   - Hàm `calculateDeductionAndPrice(product, requestedUnit, requestedQty)`:
     - Trả về `{ unitPrice, baseQuantityDeducted, validUnits, errorMessage }`.
     - Đảm bảo tính toán đồng bộ 100% giữa giá tiền bán và lượng trừ tồn kho.
3. **Cập nhật luồng tạo hóa đơn (`createInvoice`):**
   - Nhận `Unit` từ client. Gọi module `packaging.service` tính `unitPrice` và `baseQuantityDeducted`.
   - Kiểm tra `product.Quantity >= baseQuantityDeducted`.
   - Lưu đầy đủ `Unit`, `UnitPrice`, `Quantity`, `BaseQuantityDeducted` vào bản ghi `InvoiceItem`.
4. **Sửa dứt điểm luồng hoàn trả (`cancelInvoice`):**
   - Khi hoàn trả hóa đơn:
     ```ts
     for (const item of invoice.items) {
       // Cộng trả lại chính xác lượng tồn kho gốc đã bị trừ
       const restoreQty = item.BaseQuantityDeducted > 0 ? item.BaseQuantityDeducted : item.Quantity;
       await tx.product.update({
         where: { ProductID: item.ProductID },
         data: { Quantity: { increment: restoreQty } },
       });
     }
     ```
5. **Script Xử lý Dữ liệu Hóa đơn cũ (Legacy Data Migration):**
   - Tạo script quét toàn bộ các `InvoiceItem` hiện có trong database:
     - Nếu `BaseQuantityDeducted` đang trống/bằng 0: Dựa vào `UnitPrice` so với `product.Price` để nội suy đơn vị (`Hộp`, `Vỉ` hay `Viên`) và cập nhật giá trị `BaseQuantityDeducted` tương ứng.
6. **Đồng bộ giao diện POS Terminal:**
   - Dropdown hoặc Button chọn đơn vị ở POS chỉ hiển thị những đơn vị hợp lệ mà thuốc đó hỗ trợ.

---

### GIAI ĐOẠN 3: KIỂM SOÁT CHIẾT KHẤU & ĐỔI ĐIỂM THÀNH VIÊN (ƯU TIÊN 4)

1. **Ràng buộc Backend ([`invoice.controller.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/controllers/invoice.controller.ts)):**
   - Tiếp nhận `Discount` (tiền VNĐ) và `UsedPoints` (điểm thưởng đổi tiền).
   - Kiểm tra điều kiện:
     ```ts
     if (Discount < 0) throw new Error('Số tiền chiết khấu không được âm');
     if (UsedPoints < 0) throw new Error('Số điểm quy đổi không được âm');
     
     if (CustomerID && UsedPoints > 0) {
       const customer = await tx.customer.findUnique({ where: { CustomerID } });
       if (!customer || customer.LoyaltyPoints < UsedPoints) {
         throw new Error(`Bệnh nhân không đủ điểm tích lũy (Hiện có: ${customer?.LoyaltyPoints || 0} điểm, yêu cầu: ${UsedPoints} điểm)`);
       }
     }
     
     const pointDiscount = UsedPoints * 1000; // 1 điểm = 1.000 VNĐ
     const totalDiscount = Discount + pointDiscount;
     
     if (totalDiscount > subtotal) {
       throw new Error(`Tổng chiết khấu (${totalDiscount.toLocaleString()} đ) không được vượt quá tổng tiền hàng (${subtotal.toLocaleString()} đ)`);
     }
     ```
   - Cập nhật số dư điểm của khách trong cùng transaction:
     - Trừ `UsedPoints`.
     - Cộng điểm tích lũy mới `Math.floor(finalTotal / 10000)`.
2. **Ràng buộc Giao diện POS ([`PosTerminalPage.tsx`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/frontend/src/pages/PosTerminalPage.tsx)):**
   - Thêm ô chọn dùng điểm tích lũy của khách hàng (hiển thị số điểm tối đa có thể dùng `maxPoints = Math.min(customer.LoyaltyPoints, Math.floor(subTotal / 1000))`).
   - Khóa ô nhập chiết khấu tiền mặt không cho nhập số âm và giới hạn tối đa không vượt quá `subTotal - pointDiscount`.

---

### GIAI ĐOẠN 4: LUỒNG OCR THỰC TẾ & BƯỚC DUYỆT CỦA DƯỢC SĨ (ƯU TIÊN 3)

1. **Đánh dấu rõ ràng Đơn mẫu Demo ([`PrescriptionOcrPage.tsx`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/frontend/src/pages/PrescriptionOcrPage.tsx)):**
   - Tab "Mẫu đơn thử nghiệm": Đặt badge cảnh báo `[DỮ LIỆU DEMO - BỆNH VIỆN MẪU]`.
   - Tab "Tải ảnh chụp đơn thuốc": Dành riêng cho file ảnh thực tế.
2. **Tích hợp OCR Thực thụ & Xử lý Từ chối ảnh rác ([`ai.service.ts`](file:///C:/Users/Trung/.gemini/antigravity/scratch/smart-pharmacy-ai/backend/src/services/ai.service.ts)):**
   - Khi tải file ảnh thực tế: Thực hiện bóc tách ký tự qua OCR (Tesseract / EasyOCR).
   - Kiểm tra chuỗi văn bản trích xuất:
     - Nếu chuỗi rỗng, không chứa ký tự có nghĩa, hoặc không chứa bất kỳ từ khóa thuốc nào trong danh mục:
       - **Trả về lỗi rõ ràng**: `"Không thể nhận dạng đơn thuốc từ hình ảnh được tải lên. Vui lòng chụp lại ảnh rõ nét, đầy đủ ánh sáng hoặc sử dụng dữ liệu đơn mẫu."`
       - **Tuyệt đối không chạy fallback trả về đơn thuốc giả lập**.
3. **Giao diện Dược sĩ Kiểm duyệt & Hiệu chỉnh trước khi nạp sang POS:**
   - Kết quả OCR hiển thị dưới dạng bảng tương tác (Review Table):
     - Dược sĩ có thể chọn lại Tên thuốc từ dropdown (đối chiếu danh mục kho).
     - Điều chỉnh lại Số lượng và Đơn vị tính (`Hộp`/`Vỉ`/`Viên`).
     - Chỉnh sửa Hướng dẫn liều dùng.
     - Xóa dòng thuốc nhận diện nhầm hoặc thêm dòng thuốc mới.
   - Thêm nút **`"Xác nhận đơn thuốc & Chuyển vào giỏ hàng POS"`**: Dữ liệu chỉ được chuyển vào POS khi Dược sĩ đã chủ động bấm nút xác nhận này.

---

## IV. MA TRẬN FILE THAY ĐỔI & TRÁCH NHIỆM

| STT | File cần tạo / chỉnh sửa | Phân loại | Nội dung thực hiện |
| :---: | :--- | :---: | :--- |
| **1** | `backend/.env` | Chỉnh sửa | Đảm bảo biến `JWT_SECRET` bắt buộc |
| **2** | `backend/src/index.ts` | Chỉnh sửa | Bổ sung kiểm tra Fail-Fast dừng server nếu thiếu `JWT_SECRET` |
| **3** | `backend/src/middlewares/auth.middleware.ts` | **Tạo mới** | Middleware `authenticateToken` và `requireRoles` |
| **4** | `backend/src/controllers/auth.controller.ts` | Chỉnh sửa | Đăng ký tạo `INACTIVE`, login từ chối `INACTIVE`, bỏ chọn role |
| **5** | `backend/src/routes/*.routes.ts` | Chỉnh sửa | Gắn middleware bảo vệ từng router theo đúng ma trận phân quyền |
| **6** | `backend/prisma/schema.prisma` | Chỉnh sửa | Thêm `Unit`, `BaseQuantityDeducted` vào `InvoiceItem` |
| **7** | `backend/src/services/packaging.service.ts` | **Tạo mới** | Từ điển quy cách đóng gói & hàm quy đổi trừ kho/tính giá dùng chung |
| **8** | `backend/src/controllers/invoice.controller.ts` | Chỉnh sửa | Trừ kho quy chuẩn, sửa hoàn trả kho gốc, chặn chiết khấu > subtotal, trừ điểm |
| **9** | `backend/src/services/ai.service.ts` | Chỉnh sửa | OCR thực tế, từ chối ảnh rác/mờ, chặn tự động fallback |
| **10**| `backend/scripts/migrate-legacy-invoices.ts` | **Tạo mới** | Migration điền `BaseQuantityDeducted` cho hóa đơn cũ trong DB |
| **11**| `frontend/src/services/apiClient.ts` | **Tạo mới** | Axios Interceptor tự động gửi JWT và bắt lỗi 401 |
| **12**| `frontend/src/pages/PosTerminalPage.tsx` | Chỉnh sửa | Chọn đơn vị theo quy cách thực, validate chiết khấu & dùng điểm |
| **13**| `frontend/src/pages/PrescriptionOcrPage.tsx` | Chỉnh sửa | Huy hiệu demo, bảng Dược sĩ duyệt & sửa đơn trước khi sang POS |

---

## V. BỘ KỊCH BẢN KIỂM THỬ BẮT BUỘC (CRITICAL TEST SCENARIOS)

Hệ thống chỉ được coi là nghiệm thu hoàn tất khi vượt qua toàn bộ 5 kịch bản kiểm thử sau:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       5 TÌNH HUỐNG KIỂM THỬ BẮT BUỘC                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Đăng ký tài khoản mới -> INACTIVE -> Đăng nhập bị từ chối 403           │
│ 2. Bán 11 viên Decolgen -> Trừ kho đúng quy cách -> Hủy đơn hoàn chuẩn kho │
│ 3. Chiết khấu lớn hơn tổng tiền hoặc âm -> Backend & Frontend từ chối 400  │
│ 4. Dùng điểm thành viên vượt quá số dư -> API từ chối; dùng hợp lệ -> trừ   │
│ 5. Tải ảnh trắng vào OCR -> Báo lỗi; ảnh thật -> Dược sĩ duyệt mới vào POS │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Kịch bản 1: Tài khoản chưa duyệt đăng nhập & Phân quyền bảo mật
- **Bước 1**: Gửi `POST /api/auth/register` với thông tin `{ FullName: "Dược sĩ Thử Nghiệm", Email: "test@pharmacore.vn", Password: "Password123" }`.
- **Kỳ vọng**: 
  - DB lưu tài khoản với `Role: "CASHIER"`, `Status: "INACTIVE"`.
  - Phản hồi thông báo: Tài khoản đang chờ duyệt kích hoạt. Không cấp token.
- **Bước 2**: Gửi `POST /api/auth/login` với email và password trên.
- **Kỳ vọng**: Trả về mã lỗi `403 Forbidden` ("Tài khoản đang chờ duyệt hoặc đã bị khóa"). Không đăng nhập được.
- **Bước 3**: Admin cập nhật tài khoản sang `Status: "ACTIVE"` -> Đăng nhập lại -> Đăng nhập thành công và nhận JWT Token.
- **Bước 4**: Thử xóa biến `JWT_SECRET` trong `.env` và khởi động lại Backend -> Server lập tức dừng và in thông báo lỗi bảo mật (Fail-Fast).

### Kịch bản 2: Bán 11 viên thuốc rồi hủy hóa đơn (Quy đổi lẻ & Hoàn kho)
- **Chuẩn bị**: Thuốc `Decolgen Forte (Hộp 25 vỉ = 100 viên/hộp)` đang có tồn kho ban đầu là **10 Hộp**.
- **Bước 1**: Mua 11 Viên Decolgen Forte trên POS.
  - Theo quy cách: 11 viên vượt quá 1 vỉ (4 viên) và nằm trong 1 hộp (100 viên). Lượng trừ kho gốc làm tròn là **1 Hộp** (hoặc trừ theo tỷ lệ làm tròn quy chuẩn).
  - Tồn kho sau khi bán giảm từ 10 Hộp xuống còn **9 Hộp**.
  - Hóa đơn lưu: `Quantity = 11`, `Unit = "Viên"`, `BaseQuantityDeducted = 1`.
- **Bước 2**: Thực hiện Hủy / Hoàn trả hóa đơn vừa tạo (`POST /api/invoices/:id/cancel`).
- **Kỳ vọng**:
  - Tồn kho `Product.Quantity` được cộng lại chính xác `BaseQuantityDeducted = 1 Hộp` -> Trở về đúng **10 Hộp**.
  - Tuyệt đối không cộng 11 Hộp vào kho (lỗi cũ lấy `item.Quantity`).
  - Tồn kho không bị âm, không bị phồng ảo.

### Kịch bản 3: Kiểm soát Chiết khấu không hợp lệ
- **Bước 1**: Giỏ hàng có 1 hộp Panadol Extra (tổng tiền: **55.000 đ**).
- **Bước 2**: Thử gửi yêu cầu tạo hóa đơn với `Discount = -10.000 đ`.
- **Kỳ vọng**: Backend trả về `400 Bad Request` ("Số tiền chiết khấu không được âm").
- **Bước 3**: Thử gửi yêu cầu tạo hóa đơn với `Discount = 100.000 đ` (lớn hơn subtotal 55.000 đ).
- **Kỳ vọng**:
  - Giao diện POS hiển thị cảnh báo đỏ và không cho ấn thanh toán.
  - Backend trả về mã lỗi `400 Bad Request` ("Chiết khấu không được vượt quá tổng giá trị đơn hàng").

### Kịch bản 4: Kiểm soát Đổi điểm tích lũy thành viên
- **Bước 1**: Khách hàng `Nguyễn Văn A` có `LoyaltyPoints = 20 điểm` (tương đương 20.000 đ).
- **Bước 2**: Tạo đơn hàng 100.000 đ, yêu cầu dùng `UsedPoints = 50 điểm` (vượt quá 20 điểm).
- **Kỳ vọng**: Backend từ chối đơn hàng với mã lỗi `400 Bad Request` ("Bệnh nhân không đủ điểm tích lũy").
- **Bước 3**: Tạo đơn hàng với `UsedPoints = 20 điểm` và `Discount = 0 đ`.
- **Kỳ vọng**: 
  - Khách được giảm 20.000 đ, số tiền thực thu là 80.000 đ.
  - Điểm tích lũy trong hồ sơ bệnh nhân giảm từ 20 về 0, sau đó được cộng thêm điểm mới từ 80.000 đ thực thu.
- **Bước 4**: Hủy hóa đơn trên -> Điểm tích lũy được hoàn trả lại đúng 20 điểm ban đầu.

### Kịch bản 5: Nghiệm thu Luồng OCR Đơn thuốc & Dược sĩ phê duyệt
- **Bước 1**: Tải lên một file ảnh trắng hoặc ảnh ngẫu nhiên không có chữ.
- **Kỳ vọng**: Hệ thống báo lỗi rõ ràng: *"Không nhận dạng được đơn thuốc từ hình ảnh này"*. Tuyệt đối không được trả về danh sách 4 thuốc demo.
- **Bước 2**: Chọn tab "Đơn thuốc mẫu thử nghiệm (Demo)" -> Giao diện hiển thị rõ badge `[DỮ LIỆU DEMO]`.
- **Bước 3**: Sau khi nhận diện đơn thuốc thành công:
  - Giao diện dừng ở bảng Dược sĩ soát đơn (Review Step).
  - Dược sĩ sửa số lượng từ 1 Hộp thành 2 Hộp, sửa hướng dẫn liều dùng.
  - Bấm nút `"Xác nhận & Chuyển sang POS"`.
  - Giỏ hàng POS nhận chính xác số lượng 2 Hộp và liều dùng đã chỉnh sửa.

---

> Toàn bộ nội dung trên đã được chốt và cập nhật hoàn chỉnh vào file [`CODE_REVIEW_FIX_PLAN.md`](./CODE_REVIEW_FIX_PLAN.md).
