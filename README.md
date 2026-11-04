# Hệ Thống Quản Lý Nhà Thuốc & Kinh Doanh Dược Phẩm Thông Minh Tích Hợp AI

**Môn học:** Ngôn ngữ kịch bản (Lớp `D18CNPM5` - Đại học Điện Lực)  
**Nhóm thực hiện:** Nguyễn Văn Trung (`23810310321`), Đặng Minh Đức (`23810340198`)

---

## 1. Kiến Trúc Hệ Thống (3-Tier Polyglot Architecture)

- **`frontend/`**: `React 18 + TypeScript + Vite + Tailwind CSS + TanStack Table v8 + react-hotkeys-hook` (8 Forms nghiệp vụ + Bảng `Product` đủ 11 chức năng & Phím tắt CRUD).
- **`backend/`**: `Node.js + Express + TypeScript + Prisma ORM (SQLite) + Meilisearch/Fuse.js + ExcelJS + Fast-XML-Parser` (Core REST API Server).
- **`ai-service/`**: `Python + FastAPI + OpenCV + Scikit-learn` (Tiền xử lý ảnh & OCR Đơn thuốc, Chẩn đoán sơ bộ triệu chứng bằng TF-IDF & Cosine Similarity).
- **`.github/workflows/ci-cd.yml`**: Tự động kiểm thử, đồng bộ Database Schema, nạp dữ liệu mẫu và build dự án trên GitHub Actions sau mỗi lần `git push`.

---

## 2. Đáp Ứng 100% Tiêu Chí Chấm Điểm (Mục tiêu 9.5+ Điểm)

### A. Module `Product` (10 Trường Chuẩn & 11 Chức Năng Bắt Buộc)
Bảng `Product` gồm đúng 10 trường: `ProductID`, `ProductName`, `PathImage`, `ProductType`, `Quantity`, `Unit`, `Price`, `Description`, `CreateDate`, `UpdateDate`.
1. Hiển thị bảng phân trang (`10 - 15 items/page`)
2. Thêm mới (`Alt + N`, lưu `Alt + S`)
3. Cập nhật (`Alt + E`, lưu `Alt + S`)
4. Xem chi tiết (`Alt + V`)
5. Xóa 1 bản ghi & Xóa nhiều bản ghi từ Checkbox (`Alt + H`)
6. Tìm kiếm theo Tên, mô tả, mã (`Alt + F`)
7. Sao chép 1 bản ghi (`Alt + C`)
8. Sao chép nhiều bản ghi từ Checkbox (`Alt + D`)
9. Import & Export dữ liệu ra `Excel (.xlsx)`, `JSON (.json)`, `XML (.xml)` (`Alt + I` / `Alt + X`)
10. Cấu hình Ẩn/Hiện cột của Table (`Alt + K`)
11. Hệ thống phím tắt bàn phím cho toàn bộ thao tác CRUD

### B. 4 Kỹ Thuật AI Tích Hợp (Bám sát Gợi ý của Giảng viên)
1. **OCR Đơn thuốc & Hóa đơn (Gợi ý #1):** Tiền xử lý ảnh bằng `OpenCV` + Bóc tách thuốc tự động vào giỏ hàng / kho.
2. **Chatbot & Chẩn đoán Y tế sơ bộ (Gợi ý #2, #3, #5):** Tư vấn triệu chứng bệnh và gợi ý thuốc OTC đang còn tồn kho bằng `Scikit-learn` (TF-IDF + Cosine Similarity) & LLM.
3. **Kỹ thuật Tìm kiếm tối ưu Keyword (Gợi ý #8):** Tích hợp `Meilisearch` + `Fuse.js` chống sai chính tả tên thuốc.
4. **Trợ lý Giọng nói Tiếng Việt (Gợi ý #4):** Tìm kiếm thuốc và ra lệnh CRUD bằng giọng nói (`Web Speech API`).
