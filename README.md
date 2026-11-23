# PharmaCore GPP — Hệ Thống Quản Trị Nhà Thuốc ERP, Bán Hàng Trực Tuyến & AI Dược Lâm Sàng

Giải pháp phần mềm thương mại toàn diện cho chuỗi Nhà thuốc đạt chuẩn **GPP / GDP** (Chứng nhận số `108/GPP-SYT` — Sở Y tế TP. Hà Nội), tích hợp **Cổng Quản trị & Bán hàng Đa kênh ERP/POS (`:5173`)**, **Website Nhà thuốc Trực tuyến (`:5174`)**, **Hệ thống Giao dịch Tài chính - Kho Lô FEFO (`:5000`)** và **Nền tảng Trí tuệ Nhân tạo Dược Lâm Sàng (`:8000` & `:11434`)**.

---

## 1. Kiến Trúc Tổng Thể 5 Dịch Vụ (5-Service Polyglot Architecture)

| Cổng | Phân hệ | Công nghệ cốt lõi | Vai trò vận hành |
| :--- | :--- | :--- | :--- |
| **`:5173`** | **`frontend/`** (ERP & POS) | `React 18`, `TypeScript`, `Vite`, `Tailwind CSS`, `TanStack Table v8`, `TanStack Virtual` | Hệ thống quản trị nội bộ dành cho **Quản trị viên**, **Dược sĩ lâm sàng** và **Thu ngân POS** (13 phân hệ nghiệp vụ). |
| **`:5174`** | **`storefront/`** (Website Nhà thuốc) | `React 18`, `TypeScript`, `Vite`, `Tailwind CSS`, `Web Speech API`, `SSE Stream` | Website bán lẻ thuốc trực tuyến cho khách hàng: tìm kiếm thông minh, mua theo Hộp/Vỉ/Viên, gửi toa thuốc Rx, tra cứu vận đơn và **Trợ lý Dược sĩ AI** có giọng nói & sàng lọc hồ sơ người bệnh. |
| **`:5000`** | **`backend/`** (Core API & ACID Engine) | `Node.js`, `Express`, `TypeScript`, `Prisma ORM (SQLite)`, `Zod`, `Nodemailer`, `ExcelJS`, `JWT RBAC` | Quản lý **17 bảng dữ liệu quan hệ**, khóa chống lặp `Idempotency-Key`, giữ kho ưu tiên 15 phút (`InventoryReservation`), xuất kho đa lô **FEFO**, đối soát **VietQR / COD / Công nợ B2B** và gửi **Gmail SMTP thật**. |
| **`:8000`** | **`ai-service/`** (Clinical AI Microservice) | `Python 3.10`, `FastAPI`, `OpenCV`, `RapidOCR ONNX`, `Faster-Whisper`, `FastEmbed MiniLM-L12-v2`, `Rank-BM25`, `Google GenAI` | Nạp 1 lần lúc khởi động (`startupLoadCount = 1`): Quét đơn thuốc tập trung vùng **"Thuốc điều trị"**, Nhận diện giọng nói tiếng Việt, Tìm kiếm lai **Hybrid RRF** và Tư vấn **Corrective RAG** trích dẫn Dược thư Quốc gia. |
| **`:11434`** | **Ollama Local LLM** | `Ollama Runtime` (`qwen2.5:7b`) | Mô hình ngôn ngữ lớn chạy cục bộ (Local LLM) làm động cơ suy luận dự phòng tự động cho Google AI Studio (`gemini-3.5-flash-lite`). |

---

## 2. Điểm Nổi Bật Về Nghiệp Vụ Thương Mại & AI Lâm Sàng

### 2.1. Quản Trị Kho Đa Đơn Vị, Phân Bổ Lô FEFO & Giữ Hàng Ưu Tiên 15 Phút
- **Quy đổi 4 cấp đơn vị (`ProductPackaging`):** Hỗ trợ bán buôn theo `Thùng` và bán lẻ cắt liều theo `Hộp` / `Vỉ` / `Viên` (hoặc `Chai` / `Tuýp` / `Ống` / `Gói`), tự động quản lý số viên lẻ dở dang (`LooseUnits`) và đóng lại hộp nguyên khi khách hoàn trả.
- **Xuất kho chuẩn FEFO (`First-Expired, First-Out`):** Tự động phân bổ từ các lô (`StockLot`) có hạn sử dụng gần nhất còn hiệu lực; chặn bán thuốc hết hạn hoặc không có lô xác thực; hoàn trả đúng từng lô (`InvoiceItemLot`) khi hủy đơn.
- **Chống tranh chấp hộp thuốc cuối (`Optimistic Concurrency & Reservation`):** Đơn đặt hàng online tự động giữ hàng ưu tiên trong 15 phút và tự động giải phóng kho đúng 1 lần (`At-Most-Once Release`) nếu quá hạn hoặc hủy đơn.

### 2.2. Nhận Diện Đơn Thuốc Bằng AI Tập Trung Vào Bảng "Thuốc Điều Trị" (`RapidOCR + OpenCV`)
- **Tự động lọc vùng bảng thuốc:** Thuật toán tiền xử lý ảnh đơn thuốc tự động bù góc nghiêng (`y_flat`), định vị mốc neo từ **`Thuốc điều trị:`** đến **`Lời dặn:` / `Ngày ... tháng ... năm`** để bỏ qua toàn bộ phần hành chính phía trên (Sở Y Tế, CCCD, BHYT, địa chỉ) và chữ ký phía dưới.
- **Bóc tách cấu trúc bảng `STT | Tên thuốc, nồng độ | ĐVT | SL`:** Gom đúng tên thuốc kèm hàm lượng và dòng hướng dẫn cách dùng (`Tiêm dưới da...`, `Uống sau ăn...`), đối chiếu Top-5 ứng viên trong kho kèm độ tin cậy.
- **Kiểm soát 2 lớp (Human-in-the-loop):** Bắt buộc Dược sĩ xác nhận từng dòng thuốc trên giao diện trước khi chuyển sang Quầy POS xuất hóa đơn.

### 2.3. Trợ Lý Dược Sĩ AI Trực Tuyến Có Giọng Nói & Sàng Lọc Hồ Sơ Người Bệnh (`SSE Streaming`)
- **Hồ sơ sàng lọc y tế (`Patient Triage Profile`):** Khách hàng có thể chọn nhanh đối tượng (*Trẻ em < 6 tuổi, Người cao tuổi, Phụ nữ mang thai / cho con bú*) và nhập *Tiền sử dị ứng* hoặc *Bệnh nền*. Hệ thống tự động loại bỏ các sản phẩm không phù hợp (ví dụ: không gợi ý viên nén có chứa Caffeine như `Panadol Extra` cho trẻ nhỏ, ưu tiên gói bột sủi `Hapacol 250mg`).
- **Tương tác giọng nói 2 chiều:** Hỗ trợ thu âm triệu chứng tiếng Việt qua Micro (`Faster-Whisper`) và đọc to câu trả lời tư vấn bằng giọng đọc tiếng Việt tự nhiên (`vi-VN SpeechSynthesis`).
- **Phát hiện dấu hiệu cấp cứu (Red-Flag Triage):** Tự động cảnh báo đỏ yêu cầu gọi cấp cứu `115` khi phát hiện triệu chứng nguy kịch (khó thở, tím tái, co giật, nôn ra máu, đau ngực dữ dội).

### 2.4. Hộp Thư Dược Sĩ: Xem Ảnh Đơn Thuốc Bảo Mật, AI Soạn Gợi Ý & Phản Hồi Gmail Thật
- **Xem ảnh đơn thuốc đính kèm bảo mật:** Tải ảnh toa thuốc của khách qua luồng xác thực JWT (`Blob URL`), hỗ trợ phóng to Lightbox và chuyển thẳng ảnh sang phân hệ **AI Quét đơn (OCR)** chỉ với 1 cú nhấp chuột.
- **AI Gợi ý Trả lời Lâm sàng Nhanh:** Dược sĩ chọn 1 trong 3 văn phong (*Đầy đủ chuyên môn & HDSD*, *Ngắn gọn gửi Gmail*, *Hỏi thêm triệu chứng / tái khám*); AI tự động đọc thêm tên thuốc từ ảnh đơn đính kèm (nếu có) và trích dẫn Dược thư để soạn sẵn bản nháp cho Dược sĩ duyệt.
- **Gửi Email phản hồi thật (`Nodemailer Gmail SMTP`):** Hỗ trợ gửi thư tư vấn HTML chuẩn thương hiệu trực tiếp tới Gmail của bệnh nhân và lưu vết trạng thái gửi (`SENT`, `FAILED`, `Message-ID`).

---

## 3. Cấu Trúc 17 Bảng Cơ Sở Dữ Liệu Quan Hệ (`backend/prisma/schema.prisma`)

1. **`Product`**: Danh mục 35 dược phẩm & thiết bị y tế thương mại (giữ nguyên 10 cột chuẩn: `ProductID`, `ProductName`, `PathImage`, `ProductType`, `Quantity`, `Unit`, `Price`, `Description`, `CreateDate`, `UpdateDate`).
2. **`ProductPackaging`**: Quy cách đóng gói 4 cấp (`Thùng` / `Hộp` / `Vỉ` / `Viên`), giá sỉ B2B, tồn lẻ dở dang (`LooseUnits`), tồn giữ tạm (`ReservedBaseQty`) và cờ phân loại thuốc kê đơn (`IsRx`).
3. **`StockLot`**: Quản lý tồn kho theo từng số lô sản xuất (`BatchNumber`), hạn sử dụng (`ExpiryDate`) và giá vốn nhập (`ImportPrice`) phục vụ xuất kho **FEFO**.
4. **`StockMovement`**: Sổ cái biến động tồn kho bất biến (`Append-only Ledger`: `IMPORT`, `EXPORT`, `RESERVE`, `RELEASE`, `RETURN`).
5. **`User`**: Hồ sơ nhân sự, trạng thái ca trực, phiên bản Token (`TokenVersion`) và phân quyền (`ADMIN`, `PHARMACIST`, `CASHIER`).
6. **`Customer`**: Hồ sơ bệnh nhân lẻ (`RETAIL`) & đại lý/phòng khám (`WHOLESALE`), hạn mức công nợ (`CreditLimit`), dư nợ (`DebtBalance`), tiền sử dị ứng (`Allergies`), bệnh nền (`ChronicCond`) và điểm thưởng (`LoyaltyPoints`).
7. **`Supplier`**: Danh mục nhà phân phối dược phẩm đạt chuẩn GDP (`DHG Pharma`, `Zuellig Pharma`, `Sanofi`, `Traphaco`...).
8. **`PurchaseOrder`** & 9. **`PurchaseOrderItem`**: Chứng từ phiếu nhập kho theo lô & hạn dùng, hỗ trợ đảo phiếu nhập kho an toàn.
10. **`Invoice`** & 11. **`InvoiceItem`** & 12. **`InvoiceItemLot`**: Hóa đơn bán lẻ POS / bán buôn B2B / đơn Online, lưu vết phân bổ chính xác từng lô thuốc và đính kèm ảnh đơn thuốc Rx.
13. **`OnlineOrder`** & 14. **`OnlineOrderItem`** & 15. **`OnlineOrderItemLot`** & 16. **`InventoryReservation`**: Đơn đặt hàng từ Website Nhà thuốc, mã tra cứu bảo mật băm SHA-256 (`TrackingTokenHash`) và bản ghi giữ hàng ưu tiên 15 phút.
17. **`Payment`**, **`PaymentTransaction`**, **`IdempotencyRecord`**, **`Contact`**, **`ClinicalAuditLog`**, **`KnowledgeDocument`** (80 tài liệu Tờ HDSD & Dược thư Quốc gia), **`OcrDraft`**.

---

## 4. Hướng Dẫn Khởi Chạy Nhanh

### Cách 1: Khởi Chạy Tự Động Cả 5 Cổng Dịch Vụ Bằng 1 Cú Nhấp Chuột (Windows)

Tại thư mục gốc của dự án, nhấp đúp vào file **`run-app.bat`**:
- Tự động kiểm tra `Node.js`, `Python 3.10` và `Ollama`.
- Tự động giải phóng các cổng cũ (`5000`, `5173`, `5174`, `8000`) nếu bị kẹt.
- Tự động khởi chạy đồng thời cả **5 dịch vụ**:
  1. **Hệ thống Quản trị ERP & POS**: http://localhost:5173
  2. **Website Nhà thuốc Storefront**: http://localhost:5174
  3. **Backend API (`Express`)**: http://localhost:5000/api/health
  4. **Python AI Service (`FastAPI`)**: http://127.0.0.1:8000/api/py-ai/health
  5. **Ollama Local LLM**: http://127.0.0.1:11434
- Tự động mở trình duyệt cho cả 2 giao diện `:5173` và `:5174`.
- Để tắt toàn bộ 5 dịch vụ và giải phóng cổng: Nhấp đúp vào file **`stop-app.bat`**.

---

### Cách 2: Khởi Chạy Thủ Công Trên Từng Terminal

```bash
# 1. Khởi chạy Ollama Local LLM (Cổng 11434)
ollama serve

# 2. Khởi chạy Python AI Service (Cổng 8000)
cd ai-service
pip install -r requirements.txt
py -3.10 main.py

# 3. Khởi chạy Backend API (Cổng 5000)
cd backend
npm install
npx prisma db push
npm run dev

# 4. Khởi chạy Hệ thống Quản trị ERP & POS (Cổng 5173)
cd frontend
npm install
npm run dev

# 5. Khởi chạy Website Nhà thuốc Storefront (Cổng 5174)
cd storefront
npm install
npm run dev
```

---

## 5. Tài Khoản Đăng Nhập Hệ Thống ERP (`http://localhost:5173`)

| Vai trò | Họ và tên | Email đăng nhập | Mật khẩu | Phạm vi quyền hạn |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị hệ thống (`ADMIN`)** | DS. Nguyễn Văn Trung | `trung.d18cnpm5@epu.edu.vn` | `123456` | Toàn quyền trên cả 13 phân hệ, quản trị nhân sự, sổ quỹ, hoàn trả hóa đơn và thẩm định lâm sàng. |
| **Dược sĩ lâm sàng (`PHARMACIST`)** | DS. Đặng Minh Đức | `duc.d18cnpm5@epu.edu.vn` | `123456` | Duyệt đơn thuốc kê đơn (Rx), thẩm định cảnh báo tương tác/dị ứng, quét OCR, nhập kho, kiểm kê thẻ kho và phản hồi Hộp thư Dược sĩ. |
| **Thu ngân & Bán hàng (`CASHIER`)** | DS. Lê Hoàng Bảo Ngọc | `baongoc.pharmacore@epu.edu.vn` | `123456` | Bán lẻ thuốc không kê đơn (OTC) tại quầy POS, tra cứu danh mục thuốc, tiếp nhận đơn online và quản lý hồ sơ khách lẻ. |

---

## 6. Cấu Hình Tùy Chọn (`backend/.env`)

Tạo file `backend/.env` (tham khảo mẫu `backend/.env.example`) để cấu hình Gemini API và Gmail SMTP thật:

```env
PORT=5000
DATABASE_URL="file:./pharmacy.db"
JWT_SECRET="pharmacore_gpp_enterprise_jwt_secret_key_2026_strong"

# Dịch vụ AI Lâm sàng (Google AI Studio + Fallback Ollama Local qwen2.5:7b)
PYTHON_AI_SERVICE_URL="http://127.0.0.1:8000"
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-3.5-flash-lite"

# Cấu hình gửi Email phản hồi khách hàng thật từ Hộp thư Dược sĩ (Gmail App Password 16 ký tự)
GMAIL_USER="tenban@gmail.com"
GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
MAIL_FROM_NAME="Nhà Thuốc Chuẩn GPP PharmaCore"
```

---

## 7. Bộ Kiểm Thử Tự Động Toàn Diện (Automated Verification Suites)

Hệ thống đi kèm 4 bộ kiểm thử tích hợp đầu-cuối trong `backend/scripts/`:

```bash
cd backend

# 1. Kiểm thử toàn diện AI Stack (17/17 bài test: Health Single-Load, RapidOCR, Faster-Whisper STT, Hybrid RRF Search, CRAG & SSE Stream)
npx tsx scripts/verify-local-ai-stack.ts

# 2. Kiểm thử Bảo mật, Sổ cái Tài chính, FEFO Multi-lot, RBAC & VietQR (22/22 bài test)
npx tsx scripts/verify-remediation-complete.ts

# 3. Kiểm thử Chống tranh chấp hộp thuốc cuối, Idempotency-Key & COD/B2B (10/10 bài test)
npx tsx scripts/verify-code-review-22-issues.ts

# 4. Kiểm thử 5 kịch bản nghiệm thu cốt lõi (5/5 kịch bản: RBAC, Cắt liều viên lẻ, Chiết khấu, Điểm thưởng, OCR Guard)
npx tsx scripts/verify-all-5-scenarios.ts
```
