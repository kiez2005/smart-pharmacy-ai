# Smart Pharmacy — Báo cáo review tổng hợp và backlog sửa lỗi (ĐÃ HOÀN TẤT 100%)

- **Ngày rà soát gốc:** 15/11/2026 (Commit cơ sở `36b2c87`)
- **Ngày hoàn tất khắc phục & nghiệm thu:** 15/11/2026
- **Phạm vi:** Backend API (`backend`), ERP/dược sĩ (`frontend`), Storefront khách hàng (`storefront`), AI Python (`ai-service`), Prisma schema, seed và script vận hành.
- **Trạng thái tổng thể:** **ĐÃ XỬ LÝ HOÀN TẤT 17/17 HẠNG MỤC (`P0-01` → `P0-06`, `P1-01` → `P1-08`, `P2-01` → `P2-03`)**. Đã vượt qua toàn bộ 3 bộ kiểm thử tự động (`22/22`, `10/10`, `5/5`), kiểm tra biên dịch TypeScript/Python (`0` lỗi) và kiểm thử giao diện trực quan ở cả Desktop (`1280x800`) lẫn Mobile (`390x844`).

> **Ưu tiên:** P0 = chặn trước khi dùng dữ liệu/nghiệp vụ nhà thuốc thật; P1 = sửa trước khi phát hành rộng; P2 = sửa trong đợt hoàn thiện và tăng quy mô.

## Tóm tắt kết quả thực hiện

1. **[x] Bảo mật bí mật & Seed (`P0-01`):** Đã gỡ JWT secret mẫu dùng được khỏi `.env.example`, bổ sung `validateJwtSecret` chặn secret yếu/mẫu ở production (`>= 32` ký tự), khóa `seed.ts` không cho chạy trên production và bắt buộc cờ `--force-reset` + `CONFIRM_SEED_WIPE=WIPE_ALL_DATA` mới được xóa dữ liệu (mặc định dùng `upsert` idempotent), gỡ toàn bộ nút điền nhanh mật khẩu demo khỏi `AuthPage.tsx`.
2. **[x] Phân quyền tài chính khách hàng & Công nợ (`P0-02`):** Đã cấm gửi `DebtBalance` trực tiếp (`400 DEBT_DIRECT_EDIT_FORBIDDEN`), chặn `CASHIER` tạo/sửa khách `WHOLESALE` hoặc `CreditLimit` (`403 CUSTOMER_FINANCIAL_ROLE_REQUIRED`), bắt buộc khách `WHOLESALE` + kiểm tra hạn mức nguyên tử (`updateMany`) khi bán `CREDIT` ở cả POS lẫn Online.
3. **[x] Chuẩn hóa đối soát VietQR (`P0-03`, `P2-02`):** Hóa đơn `VIETQR` khởi tạo ở trạng thái `PaymentStatus = 'UNPAID'`, `PaidAmount = 0`, `DebtAmount = finalTotal`; chỉ chuyển `PAID` và ghi nhận `PaymentTransaction` (`CAPTURE`) khi nhân viên/dược sĩ đối soát với mã tham chiếu ngân hàng hợp lệ (`ReferenceCode` tối thiểu 3 ký tự, kiểm tra idempotency chống trùng mã).
4. **[x] Cấm xóa cứng chứng từ đã ghi sổ & Đảo phiếu nhập nguyên tử (`P0-04`):** Đã khóa cứng `DELETE` / `bulk-delete` đối với `invoices`, `payments`, `purchase-orders`, `payment-transactions`, `stock-movements` (`403 LEDGER_HARD_DELETE_FORBIDDEN`); bổ sung API `POST /api/enterprise/purchase-orders/:id/cancel` hoàn giảm tồn kho, trừ lô `StockLot` và ghi `StockMovement` (`RETURN_SUPPLIER`) nguyên tử trong transaction.
5. **[x] Chặn OCR mẫu/preset giả làm đơn thật (`P0-05`):** Đã tắt cơ chế đoán thuốc theo tên file đối với ảnh thật (`is_demo == False`) trong `ai-service/main.py`; gắn cờ `isDemo` xuyên suốt và khóa tạo hóa đơn/chuyển POS từ dữ liệu demo; bắt buộc Dược sĩ tích xác nhận từng dòng thuốc và nhập họ tên/SĐT bệnh nhân thật (bỏ SĐT cứng `0988112233`).
6. **[x] Chuẩn hóa AI chẩn đoán & Tương tác thuốc (`P0-06`):** Đã loại bỏ hành vi gán mặc định phác đồ cảm cúm (`CLINICAL_PROTOCOLS[0]`) và bỏ công thức nâng điểm giả `max(0.65, score * 2.4)` trong `ai-service/main.py`; trả trạng thái chuyển Dược sĩ khi triệu chứng không khớp; bổ sung `ruleSource` và `coverageScope` trong `clinical-safety.service.ts`.
7. **[x] Siết quyền đọc dữ liệu nhạy cảm (`P1-01`), sửa KPI doanh thu thực thu (`P1-02`), chống tràn lưu trữ toa thuốc (`P1-03`), an toàn `reconcile-data.ts` (`P1-04`), phân trang server-side đồng bộ (`P1-05`), kiểm soát Import nguyên tử (`P1-06`), đồng bộ Sổ quỹ (`P1-07`), ẩn `trackingToken` khỏi URL (`P1-08`) và đồng bộ RBAC/UI (`P2-01` → `P2-03`).**

---

## P0 — Chặn trước khi dùng dữ liệu thật

### P0-01 — Tài khoản demo, JWT secret mẫu và seed có thể xóa dữ liệu — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/.env.example:3`; `backend/src/config/env.ts`; `backend/prisma/seed.ts`; `frontend/src/pages/AuthPage.tsx`.

**Vấn đề:** `.env.example` đưa sẵn một JWT secret cố định và bộ cấu hình chỉ từ chối secret rỗng. Seed tạo tài khoản ACTIVE với mật khẩu `123456`; giao diện nhân sự còn hiển thị thao tác điền nhanh các tài khoản/mật khẩu đó. Trước khi tạo seed, script xóa nhiều bảng dữ liệu mà không có guard môi trường hoặc cờ xác nhận riêng.

**Đã khắc phục:**
- Cập nhật `backend/.env.example`: thay giá trị mẫu bằng hướng dẫn sinh secret ngẫu nhiên (`openssl rand -hex 32`), bổ sung `SEED_ADMIN_PASSWORD=""`.
- Cập nhật `backend/src/config/env.ts`: xuất hàm `validateJwtSecret(secret, nodeEnv)` từ chối secret rỗng ở mọi môi trường và từ chối secret `< 32` ký tự hoặc nằm trong danh sách mẫu đã biết (`smart_pharmacy_d18cnpm5_secret_key_2026`, `replace-with-a-strong-random-jwt-secret-at-least-32-chars`, v.v.) khi `NODE_ENV=production`.
- Cập nhật `backend/prisma/seed.ts`: chặn chạy trên `NODE_ENV=production` nếu không có `ALLOW_PRODUCTION_SEED=true`; mặc định chạy chế độ `upsert` idempotent không xóa dữ liệu; chỉ xóa làm sạch khi truyền đồng thời `--force-reset` và `CONFIRM_SEED_WIPE=WIPE_ALL_DATA` trong `prisma.$transaction`; mật khẩu tài khoản khởi tạo lấy từ `SEED_ADMIN_PASSWORD` hoặc sinh ngẫu nhiên 1 lần khi vắng mặt.
- Cập nhật `frontend/src/pages/AuthPage.tsx`: gỡ bỏ hoàn toàn tab `mode === 'LOGIN'` và các nút điền nhanh mật khẩu `123456` khỏi trang quản trị nhân sự.

**Trạng thái nghiệm thu:** ĐẠT (`[BACKLOG-P0-P1-P2] weakJwtBlocked=true` + kiểm thử UI `AuthPage`).

### P0-02 — CASHIER có thể tạo khách sỉ, sửa hạn mức và tự ghi đè dư nợ — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `backend/src/controllers/online-order.controller.ts`.

**Vấn đề:** Route tạo/sửa khách chấp nhận `CustomerType`, `CreditLimit` và `DebtBalance` cho mọi nhân viên đăng nhập; lập hóa đơn cho phép `PaymentMethod=CREDIT` với khách bất kỳ mà không kiểm tra `CustomerType === 'WHOLESALE'`.

**Đã khắc phục:**
- Cấm tuyệt đối truyền `DebtBalance` trong payload `POST /api/enterprise/customers` và `PUT /api/enterprise/customers/:id` (`400 DEBT_DIRECT_EDIT_FORBIDDEN`) đối với mọi vai trò; công nợ chỉ biến động qua giao dịch hóa đơn/thu nợ có lưu vết `PaymentTransaction`.
- Chặn `CASHIER` tạo khách `WHOLESALE` hoặc thiết lập/sửa `CreditLimit` (`403 CUSTOMER_FINANCIAL_ROLE_REQUIRED`).
- Trong `createInvoice` (`invoice.controller.ts`) và `pharmacistReviewOnlineOrder` (`online-order.controller.ts`): bắt buộc khách hàng có `CustomerType === 'WHOLESALE'` mới được sử dụng `PaymentMethod === 'CREDIT'` (`400 RETAIL_CREDIT_FORBIDDEN`) và kiểm tra hạn mức tín dụng nguyên tử bằng `tx.customer.updateMany`.

**Trạng thái nghiệm thu:** ĐẠT (`cashierWholesale=403, directDebt=400, retailCredit=400`).

### P0-03 — VietQR được ghi nhận đã thanh toán trước khi tiền về — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/controllers/invoice.controller.ts`; `frontend/src/pages/PosTerminalPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/AiPharmacyStudioPage.tsx`.

**Vấn đề:** Hóa đơn `VIETQR` trước đây được ghi `PAID` và tạo giao dịch `CAPTURE` ngay khi tạo hóa đơn trước khi có xác nhận chuyển khoản.

**Đã khắc phục:**
- Trong `createInvoice` (`backend/src/controllers/invoice.controller.ts`): khi `PaymentMethod === 'VIETQR'`, ép `PaidAmount = 0`, `DebtAmount = finalTotal`, `PaymentStatus = 'UNPAID'`, `payment.Status = 'UNPAID'` và chưa tạo bút toán `CAPTURE`.
- Trong `collectInvoiceDebt` (`POST /api/invoices/:id/pay-debt`): khi đối soát `VIETQR`, bắt buộc truyền `referenceCode` (mã giao dịch ngân hàng `FT...`, tối thiểu 3 ký tự — thiếu trả `400 VIETQR_REFERENCE_REQUIRED`), kiểm tra chống trùng `ReferenceCode` (idempotent), cập nhật `PaymentStatus = 'PAID'`, `PaidAmount`, `TransactionCode` và ghi `PaymentTransaction` kèm người xác nhận.
- Trên `PosTerminalPage.tsx` và `PaymentsLedgerPage.tsx`: hiển thị trạng thái `CHỜ ĐỐI SOÁT VIETQR (UNPAID)` cùng ô nhập mã tham chiếu ngân hàng để xác nhận thu tiền thật.

**Trạng thái nghiệm thu:** ĐẠT (`vqrUnpaid->Paid=true->PAID`, `vqrReconcileNoRef=400`).

### P0-04 — Xóa cứng chứng từ làm lệch tồn và xóa dấu vết kế toán — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `frontend/src/pages/InvoicesManagementPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/SuppliersAndPurchaseOrdersPage.tsx`.

**Vấn đề:** API `DELETE /api/enterprise/:entity/:id` cho phép xóa cứng hóa đơn, phiếu nhập, sổ quỹ làm mất lịch sử kế toán và lệch tồn kho.

**Đã khắc phục:**
- Trong `deleteEntityRecords` (`backend/src/controllers/enterprise.controller.ts`): chặn hoàn toàn xóa đơn lẻ và xóa hàng loạt đối với `invoices`, `payments`, `purchase-orders`, `payment-transactions`, `stock-movements` (`403 LEDGER_HARD_DELETE_FORBIDDEN`).
- Bổ sung endpoint `POST /api/enterprise/purchase-orders/:id/cancel` (`cancelPurchaseOrder`): kiểm tra các lô thuộc phiếu nhập chưa bị xuất bán (`RemainingQuantity >= Quantity`), trừ nguyên tử `Product.Quantity` và `StockLot.RemainingQuantity`, chuyển trạng thái phiếu sang `CANCELLED` và tạo bút toán `StockMovement` (`RETURN_SUPPLIER`).
- Trên UI (`InvoicesManagementPage`, `PaymentsLedgerPage`, `SuppliersAndPurchaseOrdersPage`): tắt xóa cứng chứng từ đã ghi sổ và bổ sung nút `Đảo phiếu` trên danh sách phiếu nhập kho.

**Trạng thái nghiệm thu:** ĐẠT (`hardDel=(403,403,403), poReverse=true`).

### P0-05 — OCR đang trả nội dung mẫu thay vì đọc đơn thật, rồi có thể tạo hóa đơn — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `ai-service/main.py`; `backend/src/services/ai.service.ts`; `frontend/src/pages/AiPharmacyStudioPage.tsx`; `frontend/src/pages/PrescriptionOcrPage.tsx`.

**Vấn đề:** Khi upload ảnh thật (`is_demo == False`), Python service vẫn dò từ khóa trong tên file để trả danh sách thuốc mẫu; giao diện cho phép tạo hóa đơn trực tiếp từ đơn demo và gán cứng SĐT `0988112233`.

**Đã khắc phục:**
- Trong `ai-service/main.py`: khi `is_demo == False`, tuyệt đối không suy đoán thuốc từ tên file; trả rõ `isDemo: False`, `ocrEngineStatus: 'UNCONFIGURED'` và yêu cầu Dược sĩ kiểm tra/nhập từ ảnh gốc nếu chưa cấu hình OCR engine thực.
- Trong `backend/src/services/ai.service.ts`, `AiPharmacyStudioPage.tsx` và `PrescriptionOcrPage.tsx`: truyền và hiển thị cảnh báo `isDemo` nổi bật; khóa hoàn toàn nút lập hóa đơn / chuyển POS khi `isDemo === true`; khi chuyển đơn thật sang POS/hóa đơn bắt buộc Dược sĩ tích xác nhận đã đối chiếu từng dòng thuốc và nhập họ tên + SĐT bệnh nhân thật (xóa bỏ SĐT cứng `0988112233`).

**Trạng thái nghiệm thu:** ĐẠT (kiểm thử сценарий 5 `verify-all-5-scenarios.ts` & kiểm tra UI).

### P0-06 — AI chẩn đoán và kiểm tra tương tác không đủ căn cứ để kết luận an toàn — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `ai-service/main.py`; `backend/src/services/clinical-safety.service.ts`; `backend/src/services/ai.service.ts`.

**Vấn đề:** AI Python chọn mặc định phác đồ cảm cúm (`CLINICAL_PROTOCOLS[0]`) khi không khớp từ khóa và ép điểm tương đồng tối thiểu lên `0.65`; bộ kiểm tra tương tác chưa nêu rõ phạm vi giới hạn của tập quy tắc.

**Đã khắc phục:**
- Trong `ai-service/main.py`: khi không khớp từ khóa triệu chứng nào, trả ngay trạng thái `engine: "pharmacist-handoff"`, `requiresPharmacistConsultation: True`, `recommendations: []` (không gán mặc định cảm cúm); bỏ hoàn toàn công thức nâng điểm giả `max(0.65, score * 2.4)`.
- Trong `backend/src/services/clinical-safety.service.ts`: bổ sung metadata `ruleVersion`, `ruleSource`, `coverageScope` và cảnh báo rõ kết quả không có cảnh báo chỉ mang tính tham khảo trong phạm vi bộ quy tắc nội bộ, không thay thế thẩm định chuyên môn của Dược sĩ.

**Trạng thái nghiệm thu:** ĐẠT (`[S3]`, `[ISSUE-4]`, `[SEARCH-SLIM]`).

---

## P1 — Sửa trước khi phát hành rộng

### P1-01 — Nhân viên có quyền đọc quá nhiều dữ liệu bệnh nhân, tài chính và giá vốn — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `backend/src/controllers/online-order.controller.ts`.

**Đã khắc phục:**
- Khóa quyền `authorizeRoles('ADMIN', 'PHARMACIST')` trên các route `/dashboard`, `/products/:id/stock-card`, `/suppliers`, `/purchase-orders`.
- Trong `getCustomers`, `getInvoices`, `listOnlineOrdersForStaff`: khi người gọi có vai trò `CASHIER`, tự động loại bỏ (`redact`) các trường lâm sàng/nhạy cảm (`Allergies`, `ChronicCond`, `ClinicalOverrideNote`, `PrescriptionFileKey`, `clinicalWarnings`, lịch sử `invoices`).

**Trạng thái nghiệm thu:** ĐẠT (`cashierRBAC=(403,403,redacted=true)`).

### P1-02 — Dashboard tính cả hóa đơn chưa thu và phiếu nhập đã hủy — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/controllers/enterprise.controller.ts` (`getDashboardAnalytics`).

**Đã khắc phục:**
- Tính `totalRevenue` dựa trên số tiền thực thu ròng (`PaidAmount - RefundedAmount` đối với hóa đơn `PAID` / `PARTIALLY_PAID`; hóa đơn `UNPAID` đóng góp `0` đồng).
- Loại bỏ hoàn toàn các phiếu nhập kho có `Status === 'CANCELLED'` khỏi `totalPurchaseCost`.

**Trạng thái nghiệm thu:** ĐẠT.

### P1-03 — Upload toa công khai có thể chiếm hết dung lượng lưu trữ — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/middlewares/rate-limit.middleware.ts`; `backend/src/routes/online-order.routes.ts`; `backend/src/services/prescription-storage.service.ts`.

**Đã khắc phục:**
- Bổ sung `prescriptionUploadLimiter` riêng nghiêm ngặt hơn (`12` lượt / 10 phút / IP) cho endpoint upload toa thuốc công khai.
- Trong `prescription-storage.service.ts`: bổ sung kiểm tra quota theo từng IP (`checkAndRecordIpUploadQuota`), khóa giữ chỗ dung lượng nguyên tử (`inFlightReservedBytes`) trong suốt quá trình ghi đĩa để chặn race condition khi upload đồng thời, giảm TTL mặc định của file mồ côi (`DEFAULT_ORPHAN_TTL_HOURS`) xuống `2` giờ và bổ sung chỉ số `usagePercent` / `isNearCapacityWarning`.

**Trạng thái nghiệm thu:** ĐẠT (`[ISSUE-6]`, `[RX-POLICY] default(orphan=2h,closed=0h,ret=730d)`).

### P1-04 — Script reconcile có thể xóa sản phẩm còn tồn/lịch sử kho — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/scripts/reconcile-data.ts`.

**Đã khắc phục:**
- Chỉ quyết định `action = 'DELETE'` khi sản phẩm thỏa mãn đồng thời: `refCount === 0 && stockMovementsCount === 0 && stockLotsCount === 0 && currentBaseQty === 0 && currentLooseQty === 0`; nếu còn bất kỳ lô, lịch sử biến động kho hay tồn kho nào thì chuyển sang `'HIDE'` (`IsPublished = false`).
- Sử dụng lệnh SQLite `VACUUM INTO` để tạo bản sao lưu online nhất quán, an toàn ngay cả khi DB đang bật chế độ WAL.

**Trạng thái nghiệm thu:** ĐẠT (`[RECONCILE-SAFE] realPreserved=true, testDeleted=true, testWithLotHidden=true, backupCreated=true`).

### P1-05 — ERP chỉ tải trang đầu nhưng tìm kiếm/phân trang ở trình duyệt — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `frontend/src/services/enterprise.api.ts`; `frontend/src/services/forms.api.ts`; `frontend/src/pages/CustomersPage.tsx`; `frontend/src/pages/InvoicesManagementPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`.

**Đã khắc phục:**
- Bổ sung tham số `page`, `limit`, `search`, `status` và trả đối tượng `pagination` đồng nhất từ server cho `/customers`, `/invoices`, `/payments`, `/suppliers`, `/purchase-orders`, `/products/:id/stock-card`.
- Giới hạn lịch sử hóa đơn con trong `/customers` tối đa 10 bản ghi tóm tắt (không kéo toàn bộ items vào RAM); cập nhật các trang ERP gọi tìm kiếm và chuyển trang trực tiếp tới server.

**Trạng thái nghiệm thu:** ĐẠT.

### P1-06 — Import không giới hạn kích thước/số dòng và không kiểm tra dữ liệu đồng nhất — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts` (`importEntityData`).

**Đã khắc phục:**
- Cấu hình giới hạn kích thước file Multer tối đa `5 MB` (`limits: { fileSize: 5 * 1024 * 1024, files: 1 }`) và tối đa `500` dòng mỗi lần import.
- Kiểm tra allowlist entity (`suppliers`, `customers`, `contacts`), trả ngay `400 UNSUPPORTED_IMPORT_ENTITY` nếu gọi entity lạ.
- Xác thực toàn bộ dòng bằng Zod schema trước khi ghi (từ chối dòng thiếu SĐT/tên bắt buộc thay vì tự sinh SĐT/email giả, cấm truyền `DebtBalance`) và thực thi toàn bộ trong một `prisma.$transaction` nguyên tử.

**Trạng thái nghiệm thu:** ĐẠT (`badImport=400`).

### P1-07 — Dữ liệu giao dịch và transaction ở sổ quỹ có thể không khớp trang — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/controllers/enterprise.controller.ts` (`getPaymentsLedger`); `frontend/src/pages/PaymentsLedgerPage.tsx`.

**Đã khắc phục:**
- Truy vấn `PaymentTransaction` theo đúng danh sách `InvoiceID` của các bản ghi `Payment` trên trang hiện tại (`where: { InvoiceID: { in: pageInvoiceIds } }`), đảm bảo mọi bút toán thu/hoàn của từng hóa đơn trên trang luôn hiển thị đầy đủ.
- Trả kèm đối tượng `summary` tính toán toàn cục trên server (`totalNet`, `totalVietQr`, `totalCashAndCard`, `totalRefunded`, `pendingVietQrCount`) để KPI trên `PaymentsLedgerPage` luôn chính xác bất kể đang xem trang nào.

**Trạng thái nghiệm thu:** ĐẠT (`ledgerSummary=true`).

### P1-08 — Tracking token gửi trong query string — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `storefront/src/services/api.ts`; `backend/src/controllers/online-order.controller.ts` (`trackCustomerOnlineOrder`).

**Đã khắc phục:**
- Cập nhật `storefront/src/services/api.ts` (`trackOrder`, `cancelOrder`) gửi mã tra cứu qua HTTP header `X-Tracking-Token` và chỉ truyền `orderCode` trên query string.
- Cập nhật `trackCustomerOnlineOrder` ở backend từ chối mọi request truyền `trackingToken` trên URL query string với mã `400 QUERY_TOKEN_FORBIDDEN`.

**Trạng thái nghiệm thu:** ĐẠT (`queryTokenBlocked=400`, `Track(wrong/valid)=403/200`).

---

## P2 — Hoàn thiện UX và khả năng vận hành

### P2-01 — Điều hướng hiển thị trang mà vai trò hiện tại không có quyền dùng — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `frontend/src/App.tsx`; `frontend/src/pages/AuthPage.tsx`.

**Đã khắc phục:**
- Đồng bộ ma trận quyền hiển thị menu điều hướng (`NAV_ITEMS`), phím tắt và guard chuyển trang trong `frontend/src/App.tsx` khớp tuyệt đối với backend: `AUTH` chỉ hiển thị cho `ADMIN`; `DASHBOARD`, `STOCK_CARD`, `IMPORTS`, `PAYMENTS` chỉ hiển thị cho `ADMIN` và `PHARMACIST`.
- Gỡ bỏ hoàn toàn giao diện đăng nhập demo cũ bên trong `AuthPage.tsx`.

**Trạng thái nghiệm thu:** ĐẠT.

### P2-02 — Nút đối soát VietQR chưa thực hiện đối soát thật — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/PosTerminalPage.tsx`.

**Đã khắc phục:**
- Đổi nhãn và luồng thao tác trên `PaymentsLedgerPage.tsx` và `PosTerminalPage.tsx` thành **Đối soát thủ công VietQR** yêu cầu nhập mã tham chiếu giao dịch ngân hàng (`ReferenceCode` / `FT...`) và gọi trực tiếp API `POST /api/invoices/:id/pay-debt` để ghi sổ thật.

**Trạng thái nghiệm thu:** ĐẠT.

### P2-03 — Xác nhận giao diện Desktop & Mobile bằng ảnh chụp trình duyệt — ✅ ĐÃ HOÀN TẤT

**Phạm vi:** ERP (`http://localhost:5173`) và Storefront (`http://localhost:5174`) tại kích thước Desktop (`1280x800`) và Mobile (`390x844`).

**Kết quả kiểm thử trình duyệt thực tế:**
- **ERP (`http://localhost:5173`):**
  - Desktop (`1280x800`): Trang đăng nhập chuẩn GPP, Sidebar phân quyền chuẩn xác, `AuthPage` đã bỏ hoàn toàn nút đăng nhập nhanh `123456`, `PaymentsLedgerPage` hiển thị đầy đủ thẻ KPI toàn cục (`Tổng thực thu ròng`, `Chờ đối soát VietQR`) và khóa nút xóa cứng, `SuppliersAndPurchaseOrdersPage` hiển thị nút `Đảo phiếu` trên các phiếu nhập kho hoàn tất.
  - Mobile (`390x844`): Chiều rộng khung hiển thị `390.4px` (không tràn ngang `scrollWidth <= innerWidth + 4`), thanh điều hướng và bảng dữ liệu co giãn mượt mà.
- **Storefront (`http://localhost:5174`):**
  - Desktop (`1280x800`) & Mobile (`390x844`): Hiển thị danh mục thuốc đã xuất bản kèm nhãn `Rx` / `OTC` rõ ràng, tra cứu đơn hàng qua header `X-Tracking-Token`, không tràn ngang trên thiết bị di động (`375.2px <= 394px`).

---

## Kết quả chạy kiểm thử tự động & biên dịch trên HEAD hiện tại

1. **Kiểm tra biên dịch (Typecheck & Production Build):**
   - `backend`: `npx tsc --noEmit` → **PASS (`0` lỗi)**
   - `frontend`: `npm run build` (`tsc -b && vite build`) → **PASS (`0` lỗi)**
   - `storefront`: `npm run build` (`tsc -b && vite build`) → **PASS (`0` lỗi)**
   - `ai-service`: `python -m py_compile main.py` → **PASS (`0` lỗi)**
2. **Bộ kiểm thử nghiệm thu toàn diện (`backend/scripts/verify-remediation-complete.ts` trên DB cô lập):**
   - **22/22 hạng mục ĐẠT 100% (`=== SUMMARY: 22/22 PASSED ===`)**, bao gồm `S1`, `A2`, `D1`, `A1`, `S2`, `A5`, `S3`, `A3`, `A6/U4`, `A7`, `ISSUE-2` → `ISSUE-6`, `P1/A4`, `A4-RateLimit`, `RX-CREATE-POS`, `SEARCH-SLIM`, `RX-POLICY`, `RECONCILE-SAFE` và `BACKLOG-P0-P1-P2`.
3. **Bộ kiểm thử 10 tiêu chí kiến trúc (`backend/scripts/verify-code-review-22-issues.ts`):**
   - **10/10 tiêu chí ĐẠT 100%**.
4. **Bộ kiểm thử 5 kịch bản nghiệp vụ chuẩn hóa (`backend/scripts/verify-all-5-scenarios.ts`):**
   - **5/5 kịch bản ĐẠT 100%**.
