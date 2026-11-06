# PharmaCore ERP — Hệ Thống Quản Trị Nhà Thuốc, Bán Lẻ POS & Trí Tuệ Nhân Tạo Lâm Sàng Chuẩn GPP

Hệ thống phần mềm quản trị doanh nghiệp dược phẩm (`ERP`), bán lẻ tại quầy (`POS`), quản lý hồ sơ bệnh án - tiền sử dị ứng (`Patient CRM`), số hóa đơn thuốc bằng thị giác máy tính (`OpenCV + OCR`) và trợ lý dược lâm sàng (`Scikit-learn TF-IDF & Multi-Drug Interaction Checker`).

---

## 1. Kiến Trúc Hệ Thống (3-Tier Polyglot Architecture)

- **`frontend/`**: `React 18 + TypeScript + Vite + Tailwind CSS + TanStack Table v8` — Thiết kế theo chuẩn Enterprise (`shadcn-admin` / `shadcn-table`), gồm **12 Phân hệ Nghiệp vụ** chia làm 3 phân khu chức năng.
- **`backend/`**: `Node.js + Express + TypeScript + Prisma ORM (SQLite) + Meilisearch/Fuse.js + ExcelJS + Fast-XML-Parser` — Quản lý **8 bảng cơ sở dữ liệu quan hệ** và hệ thống RESTful API giao dịch (`ACID Transaction`).
- **`ai-service/`**: `Python + FastAPI + OpenCV + Scikit-learn` — Microservice tiền xử lý ảnh đơn thuốc (`Adaptive Threshold`), bóc tách OCR và gợi ý thuốc theo triệu chứng bằng `TF-IDF Vectorizer + Cosine Similarity`.
- **`.github/workflows/ci-cd.yml`**: Pipeline `GitHub Actions CI/CD` tự động kiểm tra kiểu dữ liệu TypeScript, đồng bộ Prisma Schema, khởi tạo dữ liệu mẫu (`seed`) và build toàn bộ hệ thống sau mỗi lần `git push`.

---

## 2. Cấu Trúc 8 Bảng Cơ Sở Dữ Liệu Quan Hệ (`Prisma Schema`)

1. **`Product`**: Lưu trữ danh mục dược phẩm với 10 trường dữ liệu chuẩn (`ProductID`, `ProductName`, `PathImage`, `ProductType`, `Quantity`, `Unit`, `Price`, `Description`, `CreateDate`, `UpdateDate`).
2. **`User`**: Quản lý tài khoản nhân sự nhà thuốc và phân quyền (`ADMIN`, `PHARMACIST`, `CASHIER`).
3. **`Customer`**: Hồ sơ bệnh nhân, lưu trữ **Tiền sử dị ứng thuốc (`Allergies`)**, **Bệnh lý nền (`ChronicCond`)** và điểm tích lũy thành viên (`LoyaltyPoints`).
4. **`Supplier`**: Danh mục công ty dược phẩm và nhà phân phối đạt chuẩn GDP (`DHG Pharma`, `Traphaco`, `Sanofi`, `Zuellig Pharma`...).
5. **`PurchaseOrder` & `PurchaseOrderItem`**: Chứng từ phiếu nhập kho dược phẩm, quản lý số lô sản xuất (`BatchNumber`), hạn dùng (`ExpiryDate`), giá vốn nhập (`ImportPrice`) và tự động cộng tồn kho `Product.Quantity`.
6. **`Invoice` & `InvoiceItem`**: Hóa đơn xuất bán lẻ POS, lưu liều dùng hướng dẫn (`DosageNote`), chiết khấu, tự động trừ tồn kho khi xuất bán và tự động hoàn trả tồn kho khi hủy đơn.
7. **`Payment`**: Sổ quỹ thanh toán và đối soát giao dịch đa phương thức (`VIETQR`, `CASH`, `CARD`).
8. **`Contact`**: Phiếu yêu cầu tư vấn dược lâm sàng và lịch sử phản hồi của dược sĩ.

---

## 3. Danh Mục 12 Phân Hệ Nghiệp Vụ Trên Giao Diện

### Phân Khu 1: Quản Trị Kho & Dược Phẩm
1. **Tổng quan điều hành (`DashboardPage`)**: 4 thẻ KPI tài chính & tồn kho thời gian thực, biểu đồ phân bổ giá trị kho theo nhóm dược lý, bảng xếp hạng thuốc bán chạy và cảnh báo thuốc sắp hết hàng.
2. **Danh mục dược phẩm chuẩn 11 chức năng (`ProductManagementPage`)**:
   - Phân trang tùy chỉnh (`10 / 12 / 15` dòng/trang) & Sắp xếp cột 2 chiều (`ASC/DESC`)
   - Thêm mới (`Alt + N`), Cập nhật (`Alt + E`), Lưu nhanh (`Alt + S`), Xem chi tiết (`Alt + V`)
   - Tải ảnh trực tiếp từ máy tính (`Base64 FileReader`) hoặc liên kết URL
   - Xóa đơn lẻ & Xóa hàng loạt theo Checkbox (`Alt + H`)
   - Nhân bản 1 bản ghi (`Alt + C`) & Nhân bản hàng loạt theo Checkbox (`Alt + D`)
   - Tìm kiếm đa tiêu chí chống sai chính tả (`Meilisearch / Fuse.js`) & Tìm kiếm bằng giọng nói Tiếng Việt (`Web Speech API`)
   - Import (có Modal xem trước thông tin tệp) & Export dữ liệu ra 3 định dạng: `Excel (.xlsx)`, `JSON (.json)`, `XML (.xml)` (`Alt + I`, `Alt + X`)
   - Tùy chỉnh Ẩn/Hiện cột linh hoạt có lưu trạng thái (`Alt + K`)
3. **Hồ sơ thuốc & Thẻ kho (`ProductStockCardPage`)**: Truy xuất lịch sử các lô nhập kho (`+SL`), lịch sử xuất bán POS (`-SL`) và in tem nhãn mã vạch SKU.
4. **Nhà cung cấp & Nhập kho (`SuppliersAndPurchaseOrdersPage`)**: Quản lý đối tác cung ứng và lập phiếu nhập kho tự động cộng dồn số lượng tồn kho.

### Phân Khu 2: Bán Lẻ POS, Hóa Đơn, Sổ Quỹ & Bệnh Nhân
5. **Quầy thu ngân POS (`PosTerminalPage`)**: Chọn thuốc nhanh theo nhóm, chọn hồ sơ bệnh nhân, **tự động phát cảnh báo đỏ nếu thuốc trong giỏ trùng tiền sử dị ứng của bệnh nhân hoặc trùng hoạt chất**, tính chiết khấu, tiền thừa và tạo mã `VietQR Napas247`.
6. **Hóa đơn & Hoàn trả hàng (`InvoicesManagementPage`)**: Xem/in phiếu xuất thuốc GPP và xử lý **Hoàn trả đơn hàng** (tự động hoàn tiền và cộng trả lại số lượng vào kho `Product`).
7. **Sổ quỹ & Đối soát VietQR (`PaymentsLedgerPage`)**: Quản lý dòng tiền thực thu theo từng phương thức thanh toán và tra cứu chứng từ QR.
8. **Hồ sơ bệnh nhân & Dị ứng (`CustomersPage`)**: Quản lý tiền sử dị ứng hoạt chất, bệnh lý mãn tính và lịch sử mua thuốc của từng bệnh nhân.

### Phân Khu 3: Lâm Sàng AI, OCR, CSKH & Hệ Thống
9. **Số hóa đơn thuốc OCR (`PrescriptionOcrPage`)**: Tiền xử lý ảnh đơn thuốc bằng bộ lọc nhị phân `OpenCV Adaptive Threshold`, bóc tách tên thuốc/liều dùng, đối chiếu tồn kho và chuyển toàn bộ vào giỏ hàng POS chỉ với 1 cú nhấp chuột.
10. **Dược lâm sàng & Tương tác thuốc (`ClinicalAiAndInteractionPage`)**: Tư vấn thuốc theo triệu chứng bằng `TF-IDF + Cosine Similarity` kết hợp công cụ kiểm tra tương tác đa thuốc và cảnh báo quá liều `Paracetamol` / `NSAID`.
11. **Tư vấn dược sĩ & CSKH (`ContactPage`)**: Tiếp nhận và phản hồi câu hỏi tư vấn liều dùng của người bệnh.
12. **Nhân sự & Phân quyền (`AuthPage`)**: Quản lý danh sách nhân sự, cấp phát tài khoản mới, đăng nhập JWT và phân quyền vai trò (`ADMIN`, `PHARMACIST`, `CASHIER`).

---

## 4. Hướng Dẫn Cài Đặt & Khởi Chạy Nhanh

### 🚀 Cách 1: Khởi Chạy Nhanh Bằng 1 Cú Nhấp Chuột (Dành cho Windows)
Chỉ cần nhấp đúp vào file **`run-app.bat`** ở thư mục gốc:
- Tự động kiểm tra môi trường Node.js.
- Tự động cài đặt thư viện (`npm install`) và khởi tạo cơ sở dữ liệu nếu chạy lần đầu.
- Tự động bật đồng thời **Backend API** (cổng `5000`) và **Frontend Web UI** (cổng `5173`).
- Tự động mở trình duyệt web tại địa chỉ `http://localhost:5173`.
- Khi muốn tắt toàn bộ hệ thống: Nhấp đúp vào file **`stop-app.bat`**.

---

### 💻 Cách 2: Khởi Chạy Thủ Công Bằng Terminal
```bash
cd backend
npm install
npx prisma db push
npm run db:seed
npm run dev
```

### Bước 2: Khởi chạy Frontend Web App (Port `5173`)
```bash
cd frontend
npm install
npm run dev
```

### Bước 3 (Tùy chọn): Khởi chạy Python AI Microservice (Port `8000`)
*(Hệ thống có cơ chế Auto-Fallback thông minh trên Node.js nên vẫn hoạt động đầy đủ 100% tính năng ngay cả khi không bật Python server)*
```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
