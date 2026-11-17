# Smart Pharmacy — Báo cáo review tổng hợp và backlog sửa lỗi (CÒN TỒN ĐỌNG SAU REVIEW)

- **Ngày rà soát gốc:** 15/11/2026 (Commit cơ sở `36b2c87`)
- **Ngày cập nhật kết quả review lại:** 15/11/2026
- **Phạm vi:** Backend API (`backend`), ERP/dược sĩ (`frontend`), Storefront khách hàng (`storefront`), AI Python (`ai-service`), Prisma schema, seed và script vận hành.
- **Commit được review lại:** `29119d9` (15/11/2026).
- **Trạng thái tổng thể:** **Chưa thể xác nhận 17/17 đã hoàn tất.** Review tĩnh commit `29119d9` còn phát hiện 8 điểm cần xử lý trong `P0-01`, `P0-03`, `P0-04`, `P0-06`, `P1-01`, `P1-05`, `P1-07`, `P2-02` (chi tiết bên dưới). Các số liệu kiểm thử `22/22`, `10/10`, `5/5` và kiểm thử giao diện là kết quả được ghi trong bản trước; lượt review này **không chạy lại test**.

> **Ưu tiên:** P0 = chặn trước khi dùng dữ liệu/nghiệp vụ nhà thuốc thật; P1 = sửa trước khi phát hành rộng; P2 = sửa trong đợt hoàn thiện và tăng quy mô.

## Kết quả review lại commit `29119d9` — việc còn phải sửa

Các mục dưới đây đối chiếu trực tiếp với backlog gốc; không phải các giả thuyết mới. Các phần “Đã khắc phục” ở sau ghi lại thay đổi của commit, nhưng trạng thái hoàn tất cần được hiểu theo các tồn đọng cụ thể này.

1. **`P0-01` — Seed có thể tạo tài khoản admin không đăng nhập được.** Nếu cả `SEED_ADMIN_PASSWORD` và `SEED_DEFAULT_PASSWORD` để trống, `seed.ts` sinh `bootstrapPassword` ngẫu nhiên, chỉ hash để lưu DB rồi bỏ mật khẩu gốc; log cũng không in hoặc cung cấp cách lấy lại. Ở DB mới, tài khoản admin mẫu vì vậy không có thông tin đăng nhập khả dụng. Nên yêu cầu cấu hình mật khẩu khởi tạo đủ mạnh và dừng seed nếu thiếu; cung cấp quy trình reset riêng có kiểm soát.
2. **`P0-03` — Reference VietQR chưa được chống trùng toàn hệ thống.** `collectInvoiceDebt` chỉ tìm `ReferenceCode` trong `invoice.paymentTransactions` của hóa đơn đang thu; schema không đặt unique cho mã tham chiếu. Cùng một mã FT có thể được nhập cho hóa đơn khác và ghi nhận thu tiền lần nữa. Đồng thời `paymentMethod` lấy trực tiếp từ body dưới dạng `string`, không validate enum/tính tương thích với phương thức của hóa đơn. Cần chống trùng nguyên tử ở cấp DB/toàn hệ thống cho giao dịch ngân hàng và validate phương thức trước khi ghi sổ.
3. **`P0-04` — Đảo phiếu nhập có thể trừ nhầm StockLot.** `cancelPurchaseOrder` tìm lô theo `ProductID + BatchNumber + Status`, rồi lấy `LotID` mới nhất; không khớp `ExpiryDate` hay liên kết lô được tạo bởi chính `PurchaseOrderItem`. Nếu có nhiều lô cùng mã lô, thao tác có thể giảm tồn ở lô khác với lô của dòng phiếu. Cần liên kết chính xác `PurchaseOrderItem` với `LotID` khi nhập, rồi đảo đúng lô đó; tối thiểu phải khớp cả hạn dùng và xử lý trường hợp trùng lô rõ ràng.
4. **`P0-06` — AI vẫn đưa lời khuyên điều trị/thuốc theo bộ từ khóa mẫu.** `CLINICAL_PROTOCOLS` vẫn trả tên hội chứng, hướng dẫn dùng thuốc và cảnh báo viết sẵn; truy vấn TF-IDF còn được bơm `priority_terms` là các thuốc đặt trước. `ai.service.ts` đánh dấu `requiresPharmacistConsultation=false` khi có ít nhất một gợi ý, dù `matchNote` nói cần Dược sĩ thẩm định. Màn hình kiểm tra tương tác cũng hiện trạng thái xanh “Phối hợp thuốc an toàn” khi rule set không có cảnh báo, trong khi bộ quy tắc chỉ giới hạn. Metadata/disclaimer chưa ngăn kết luận an toàn sai. Cho đến khi có nguồn lâm sàng được thẩm định và độ bao phủ phù hợp, cần bắt buộc Dược sĩ xem xét, không phát thông điệp “an toàn” từ kết quả rỗng, và không trả phác đồ/thuốc mẫu như lời khuyên dùng thuốc.
5. **`P1-01` — CASHIER vẫn đọc và sửa được dữ liệu lâm sàng qua `PUT /customers/:id`.** `updateCustomer` chỉ cấm CASHIER sửa `CustomerType`, `CreditLimit`, `TaxCode`; schema vẫn nhận `Allergies` và `ChronicCond`. Hơn nữa, kết quả `prisma.customer.update` trả toàn bộ scalar fields nên phản hồi của endpoint lộ lại hai trường mà `GET /customers` đã redact. Cần allowlist field theo role và trả DTO đã redact cho CASHIER; chỉ PHARMACIST/ADMIN được đọc hoặc thay đổi hồ sơ lâm sàng.
6. **`P1-05` — Các trang ERP chưa dùng phân trang/tìm kiếm server-side.** `InvoicesManagementPage` gọi `listInvoices()` không tham số (mặc định chỉ 50 dòng); `CustomersPage` chỉ lấy 200 khách rồi lọc/phân trang ở client; `SuppliersAndPurchaseOrdersPage` gọi suppliers và purchase orders không tham số (mặc định 50). Dữ liệu cũ hơn không xuất hiện trong bảng/tìm kiếm dù backend có `pagination`. Cần truyền `page`, `limit`, `search`, `status` từ từng trang và dùng tổng số trang/tổng bản ghi server trả về.
7. **`P1-07` — KPI sổ quỹ chính xác nhưng phép tính tải toàn bộ Payment vào RAM.** `getPaymentsLedger` lấy `allPaymentsForSummary` bằng `findMany` không giới hạn để cộng KPI trên mỗi request. Bảng lớn sẽ làm thời gian phản hồi và bộ nhớ tăng theo tổng lịch sử. Chuyển phép cộng sang aggregate/groupBy hoặc truy vấn SQL tổng hợp trong DB, giữ truy vấn danh sách giao dịch theo trang.
8. **`P2-02` — UI vẫn mô tả đối soát thủ công như tự động.** Một số nhãn ở `PaymentsLedgerPage` còn ghi “đối soát tự động VietQR/Napas247”, “Nhật Ký Đối Soát Tự Động” và “Khớp lệnh biến động số dư”, dù hệ thống chỉ cho nhân viên nhập mã tham chiếu thủ công, không kết nối Napas/ngân hàng. Đổi các nhãn còn sót thành “đối soát thủ công”; chỉ quảng bá tự động khi có tích hợp xác thực giao dịch thực.

**Phạm vi lượt này:** đọc diff của commit, kiểm tra các controller/service/UI liên quan và đối chiếu với các mục backlog trên. Không chỉnh sửa code ứng dụng và không chạy test.

## Tóm tắt kết quả thực hiện

1. **[~] Bảo mật bí mật & Seed (`P0-01`):** JWT secret/reset guard và gỡ mật khẩu demo đã có; mật khẩu admin ngẫu nhiên khi seed thiếu `SEED_ADMIN_PASSWORD` không được cung cấp lại, xem tồn đọng ở đầu file.
2. **[x] Phân quyền tài chính khách hàng & Công nợ (`P0-02`):** Đã cấm gửi `DebtBalance` trực tiếp (`400 DEBT_DIRECT_EDIT_FORBIDDEN`), chặn `CASHIER` tạo/sửa khách `WHOLESALE` hoặc `CreditLimit` (`403 CUSTOMER_FINANCIAL_ROLE_REQUIRED`), bắt buộc khách `WHOLESALE` + kiểm tra hạn mức nguyên tử (`updateMany`) khi bán `CREDIT` ở cả POS lẫn Online.
3. **[~] Chuẩn hóa đối soát VietQR (`P0-03`, `P2-02`):** Luồng unpaid và nhập mã reference đã có; cần chống trùng reference toàn hệ thống, validate phương thức, và sửa nhãn còn mô tả tự động/Napas247 dù thao tác thủ công.
4. **[~] Cấm xóa cứng chứng từ đã ghi sổ & Đảo phiếu nhập nguyên tử (`P0-04`):** Đã khóa hard-delete và có API cancel transaction; cần bảo đảm mỗi dòng phiếu nhập đảo đúng StockLot nguồn, không chọn lô gần nhất theo mã lô.
5. **[x] Chặn OCR mẫu/preset giả làm đơn thật (`P0-05`):** Đã tắt cơ chế đoán thuốc theo tên file đối với ảnh thật (`is_demo == False`) trong `ai-service/main.py`; gắn cờ `isDemo` xuyên suốt và khóa tạo hóa đơn/chuyển POS từ dữ liệu demo; bắt buộc Dược sĩ tích xác nhận từng dòng thuốc và nhập họ tên/SĐT bệnh nhân thật (bỏ SĐT cứng `0988112233`).
6. **[~] Chuẩn hóa AI chẩn đoán & Tương tác thuốc (`P0-06`):** Đã bỏ fallback cảm cúm và điểm tương đồng giả, thêm cảnh báo giới hạn ruleset; vẫn còn advice/recommendation viết sẵn theo từ khóa và thông báo UI xanh khi không có cảnh báo.
7. **[~]** Các phần `P1-02` → `P1-04`, `P1-06`, `P1-08`, `P2-01` và các hạng mục không được nêu ở phần review lại chưa phát hiện tồn đọng trực tiếp trong phạm vi lượt này. `P1-01`, `P1-05`, `P1-07`, `P2-02` còn các điểm cụ thể nêu ở đầu file.

---

## P0 — Chặn trước khi dùng dữ liệu thật

### P0-01 — Tài khoản demo, JWT secret mẫu và seed có thể xóa dữ liệu — ⚠ CÒN TỒN ĐỌNG BOOTSTRAP

**Vị trí:** `backend/.env.example:3`; `backend/src/config/env.ts`; `backend/prisma/seed.ts`; `frontend/src/pages/AuthPage.tsx`.

**Vấn đề:** `.env.example` đưa sẵn một JWT secret cố định và bộ cấu hình chỉ từ chối secret rỗng. Seed tạo tài khoản ACTIVE với mật khẩu `123456`; giao diện nhân sự còn hiển thị thao tác điền nhanh các tài khoản/mật khẩu đó. Trước khi tạo seed, script xóa nhiều bảng dữ liệu mà không có guard môi trường hoặc cờ xác nhận riêng.

**Đã khắc phục:**
- Cập nhật `backend/.env.example`: thay giá trị mẫu bằng hướng dẫn sinh secret ngẫu nhiên (`openssl rand -hex 32`), bổ sung `SEED_ADMIN_PASSWORD=""`.
- Cập nhật `backend/src/config/env.ts`: xuất hàm `validateJwtSecret(secret, nodeEnv)` từ chối secret rỗng ở mọi môi trường và từ chối secret `< 32` ký tự hoặc nằm trong danh sách mẫu đã biết (`smart_pharmacy_d18cnpm5_secret_key_2026`, `replace-with-a-strong-random-jwt-secret-at-least-32-chars`, v.v.) khi `NODE_ENV=production`.
- Cập nhật `backend/prisma/seed.ts`: chặn chạy trên `NODE_ENV=production` nếu không có `ALLOW_PRODUCTION_SEED=true`; mặc định chạy chế độ `upsert` idempotent không xóa dữ liệu; chỉ xóa làm sạch khi truyền đồng thời `--force-reset` và `CONFIRM_SEED_WIPE=WIPE_ALL_DATA` trong `prisma.$transaction`; mật khẩu tài khoản khởi tạo lấy từ `SEED_ADMIN_PASSWORD` hoặc sinh ngẫu nhiên 1 lần khi vắng mặt.
- Cập nhật `frontend/src/pages/AuthPage.tsx`: gỡ bỏ hoàn toàn tab `mode === 'LOGIN'` và các nút điền nhanh mật khẩu `123456` khỏi trang quản trị nhân sự.

**Trạng thái nghiệm thu:** JWT/reset guard đã được thêm; cần xử lý tồn đọng mật khẩu bootstrap ở phần review lại trước khi đánh dấu hoàn tất.

### P0-02 — CASHIER có thể tạo khách sỉ, sửa hạn mức và tự ghi đè dư nợ — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `backend/src/controllers/online-order.controller.ts`.

**Vấn đề:** Route tạo/sửa khách chấp nhận `CustomerType`, `CreditLimit` và `DebtBalance` cho mọi nhân viên đăng nhập; lập hóa đơn cho phép `PaymentMethod=CREDIT` với khách bất kỳ mà không kiểm tra `CustomerType === 'WHOLESALE'`.

**Đã khắc phục:**
- Cấm tuyệt đối truyền `DebtBalance` trong payload `POST /api/enterprise/customers` và `PUT /api/enterprise/customers/:id` (`400 DEBT_DIRECT_EDIT_FORBIDDEN`) đối với mọi vai trò; công nợ chỉ biến động qua giao dịch hóa đơn/thu nợ có lưu vết `PaymentTransaction`.
- Chặn `CASHIER` tạo khách `WHOLESALE` hoặc thiết lập/sửa `CreditLimit` (`403 CUSTOMER_FINANCIAL_ROLE_REQUIRED`).
- Trong `createInvoice` (`invoice.controller.ts`) và `pharmacistReviewOnlineOrder` (`online-order.controller.ts`): bắt buộc khách hàng có `CustomerType === 'WHOLESALE'` mới được sử dụng `PaymentMethod === 'CREDIT'` (`400 RETAIL_CREDIT_FORBIDDEN`) và kiểm tra hạn mức tín dụng nguyên tử bằng `tx.customer.updateMany`.

**Trạng thái nghiệm thu:** ĐẠT (`cashierWholesale=403, directDebt=400, retailCredit=400`).

### P0-03 — VietQR được ghi nhận đã thanh toán trước khi tiền về — ⚠ CÒN TỒN ĐỌNG CHỐNG TRÙNG TOÀN CỤC

**Vị trí:** `backend/src/controllers/invoice.controller.ts`; `frontend/src/pages/PosTerminalPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/AiPharmacyStudioPage.tsx`.

**Vấn đề:** Hóa đơn `VIETQR` trước đây được ghi `PAID` và tạo giao dịch `CAPTURE` ngay khi tạo hóa đơn trước khi có xác nhận chuyển khoản.

**Đã khắc phục:**
- Trong `createInvoice` (`backend/src/controllers/invoice.controller.ts`): khi `PaymentMethod === 'VIETQR'`, ép `PaidAmount = 0`, `DebtAmount = finalTotal`, `PaymentStatus = 'UNPAID'`, `payment.Status = 'UNPAID'` và chưa tạo bút toán `CAPTURE`.
- Trong `collectInvoiceDebt` (`POST /api/invoices/:id/pay-debt`): khi đối soát `VIETQR`, bắt buộc truyền `referenceCode` (mã giao dịch ngân hàng `FT...`, tối thiểu 3 ký tự — thiếu trả `400 VIETQR_REFERENCE_REQUIRED`), kiểm tra chống trùng `ReferenceCode` (idempotent), cập nhật `PaymentStatus = 'PAID'`, `PaidAmount`, `TransactionCode` và ghi `PaymentTransaction` kèm người xác nhận.
- Trên `PosTerminalPage.tsx` và `PaymentsLedgerPage.tsx`: hiển thị trạng thái `CHỜ ĐỐI SOÁT VIETQR (UNPAID)` cùng ô nhập mã tham chiếu ngân hàng để xác nhận thu tiền thật.

**Trạng thái nghiệm thu:** Luồng unpaid và bắt buộc reference đã có; chống trùng hiện chỉ trong phạm vi một hóa đơn, xem review lại ở đầu file.

### P0-04 — Xóa cứng chứng từ làm lệch tồn và xóa dấu vết kế toán — ⚠ CÒN TỒN ĐỌNG CHỌN ĐÚNG LÔ

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `frontend/src/pages/InvoicesManagementPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/SuppliersAndPurchaseOrdersPage.tsx`.

**Vấn đề:** API `DELETE /api/enterprise/:entity/:id` cho phép xóa cứng hóa đơn, phiếu nhập, sổ quỹ làm mất lịch sử kế toán và lệch tồn kho.

**Đã khắc phục:**
- Trong `deleteEntityRecords` (`backend/src/controllers/enterprise.controller.ts`): chặn hoàn toàn xóa đơn lẻ và xóa hàng loạt đối với `invoices`, `payments`, `purchase-orders`, `payment-transactions`, `stock-movements` (`403 LEDGER_HARD_DELETE_FORBIDDEN`).
- Bổ sung endpoint `POST /api/enterprise/purchase-orders/:id/cancel` (`cancelPurchaseOrder`): kiểm tra các lô thuộc phiếu nhập chưa bị xuất bán (`RemainingQuantity >= Quantity`), trừ nguyên tử `Product.Quantity` và `StockLot.RemainingQuantity`, chuyển trạng thái phiếu sang `CANCELLED` và tạo bút toán `StockMovement` (`RETURN_SUPPLIER`).
- Trên UI (`InvoicesManagementPage`, `PaymentsLedgerPage`, `SuppliersAndPurchaseOrdersPage`): tắt xóa cứng chứng từ đã ghi sổ và bổ sung nút `Đảo phiếu` trên danh sách phiếu nhập kho.

**Trạng thái nghiệm thu:** Chặn xóa cứng và có luồng đảo phiếu; cần sửa liên kết/tra cứu StockLot để bảo đảm chỉ đảo đúng lô nguồn.

### P0-05 — OCR đang trả nội dung mẫu thay vì đọc đơn thật, rồi có thể tạo hóa đơn — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `ai-service/main.py`; `backend/src/services/ai.service.ts`; `frontend/src/pages/AiPharmacyStudioPage.tsx`; `frontend/src/pages/PrescriptionOcrPage.tsx`.

**Vấn đề:** Khi upload ảnh thật (`is_demo == False`), Python service vẫn dò từ khóa trong tên file để trả danh sách thuốc mẫu; giao diện cho phép tạo hóa đơn trực tiếp từ đơn demo và gán cứng SĐT `0988112233`.

**Đã khắc phục:**
- Trong `ai-service/main.py`: khi `is_demo == False`, tuyệt đối không suy đoán thuốc từ tên file; trả rõ `isDemo: False`, `ocrEngineStatus: 'UNCONFIGURED'` và yêu cầu Dược sĩ kiểm tra/nhập từ ảnh gốc nếu chưa cấu hình OCR engine thực.
- Trong `backend/src/services/ai.service.ts`, `AiPharmacyStudioPage.tsx` và `PrescriptionOcrPage.tsx`: truyền và hiển thị cảnh báo `isDemo` nổi bật; khóa hoàn toàn nút lập hóa đơn / chuyển POS khi `isDemo === true`; khi chuyển đơn thật sang POS/hóa đơn bắt buộc Dược sĩ tích xác nhận đã đối chiếu từng dòng thuốc và nhập họ tên + SĐT bệnh nhân thật (xóa bỏ SĐT cứng `0988112233`).

**Trạng thái nghiệm thu:** ĐẠT (kiểm thử сценарий 5 `verify-all-5-scenarios.ts` & kiểm tra UI).

### P0-06 — AI chẩn đoán và kiểm tra tương tác không đủ căn cứ để kết luận an toàn — ⚠ CHƯA ĐẠT AN TOÀN LÂM SÀNG

**Vị trí:** `ai-service/main.py`; `backend/src/services/clinical-safety.service.ts`; `backend/src/services/ai.service.ts`.

**Vấn đề:** AI Python chọn mặc định phác đồ cảm cúm (`CLINICAL_PROTOCOLS[0]`) khi không khớp từ khóa và ép điểm tương đồng tối thiểu lên `0.65`; bộ kiểm tra tương tác chưa nêu rõ phạm vi giới hạn của tập quy tắc.

**Đã khắc phục:**
- Trong `ai-service/main.py`: khi không khớp từ khóa triệu chứng nào, trả ngay trạng thái `engine: "pharmacist-handoff"`, `requiresPharmacistConsultation: True`, `recommendations: []` (không gán mặc định cảm cúm); bỏ hoàn toàn công thức nâng điểm giả `max(0.65, score * 2.4)`.
- Trong `backend/src/services/clinical-safety.service.ts`: bổ sung metadata `ruleVersion`, `ruleSource`, `coverageScope` và cảnh báo rõ kết quả không có cảnh báo chỉ mang tính tham khảo trong phạm vi bộ quy tắc nội bộ, không thay thế thẩm định chuyên môn của Dược sĩ.

**Trạng thái nghiệm thu:** Đã bỏ fallback cảm cúm mặc định và điểm tương đồng giả; vẫn còn advice/recommendation theo từ khóa và UI có thể thể hiện an toàn khi ruleset rỗng. Chưa đánh dấu hoàn tất.

---

## P1 — Sửa trước khi phát hành rộng

### P1-01 — Nhân viên có quyền đọc quá nhiều dữ liệu bệnh nhân, tài chính và giá vốn — ⚠ CÒN HỞ API CẬP NHẬT KHÁCH

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `backend/src/controllers/online-order.controller.ts`.

**Đã khắc phục:**
- Khóa quyền `authorizeRoles('ADMIN', 'PHARMACIST')` trên các route `/dashboard`, `/products/:id/stock-card`, `/suppliers`, `/purchase-orders`.
- Trong `getCustomers`, `getInvoices`, `listOnlineOrdersForStaff`: khi người gọi có vai trò `CASHIER`, tự động loại bỏ (`redact`) các trường lâm sàng/nhạy cảm (`Allergies`, `ChronicCond`, `ClinicalOverrideNote`, `PrescriptionFileKey`, `clinicalWarnings`, lịch sử `invoices`).

**Trạng thái nghiệm thu:** Các route đã giới hạn và GET đã redact; `PUT /customers/:id` vẫn nhận/ trả trường lâm sàng cho CASHIER, xem review lại ở đầu file.

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

### P1-05 — ERP chỉ tải trang đầu nhưng tìm kiếm/phân trang ở trình duyệt — ⚠ API CÓ PHÂN TRANG, UI CHƯA DÙNG ĐỒNG BỘ

**Vị trí:** `backend/src/controllers/enterprise.controller.ts`; `backend/src/controllers/invoice.controller.ts`; `frontend/src/services/enterprise.api.ts`; `frontend/src/services/forms.api.ts`; `frontend/src/pages/CustomersPage.tsx`; `frontend/src/pages/InvoicesManagementPage.tsx`; `frontend/src/pages/PaymentsLedgerPage.tsx`.

**Đã khắc phục:**
- Bổ sung tham số `page`, `limit`, `search`, `status` và trả đối tượng `pagination` đồng nhất từ server cho `/customers`, `/invoices`, `/payments`, `/suppliers`, `/purchase-orders`, `/products/:id/stock-card`.
- Giới hạn lịch sử hóa đơn con trong `/customers` tối đa 10 bản ghi tóm tắt (không kéo toàn bộ items vào RAM); cập nhật các trang ERP gọi tìm kiếm và chuyển trang trực tiếp tới server.

**Trạng thái nghiệm thu:** API đã hỗ trợ query pagination; các trang hóa đơn/khách/nhà cung cấp/phiếu nhập vẫn tải một trang cố định rồi lọc ở client, xem review lại ở đầu file.

### P1-06 — Import không giới hạn kích thước/số dòng và không kiểm tra dữ liệu đồng nhất — ✅ ĐÃ HOÀN TẤT

**Vị trí:** `backend/src/routes/enterprise.routes.ts`; `backend/src/controllers/enterprise.controller.ts` (`importEntityData`).

**Đã khắc phục:**
- Cấu hình giới hạn kích thước file Multer tối đa `5 MB` (`limits: { fileSize: 5 * 1024 * 1024, files: 1 }`) và tối đa `500` dòng mỗi lần import.
- Kiểm tra allowlist entity (`suppliers`, `customers`, `contacts`), trả ngay `400 UNSUPPORTED_IMPORT_ENTITY` nếu gọi entity lạ.
- Xác thực toàn bộ dòng bằng Zod schema trước khi ghi (từ chối dòng thiếu SĐT/tên bắt buộc thay vì tự sinh SĐT/email giả, cấm truyền `DebtBalance`) và thực thi toàn bộ trong một `prisma.$transaction` nguyên tử.

**Trạng thái nghiệm thu:** ĐẠT (`badImport=400`).

### P1-07 — Dữ liệu giao dịch và transaction ở sổ quỹ có thể không khớp trang — ⚠ CÒN TỒN ĐỌNG HIỆU NĂNG AGGREGATE

**Vị trí:** `backend/src/controllers/enterprise.controller.ts` (`getPaymentsLedger`); `frontend/src/pages/PaymentsLedgerPage.tsx`.

**Đã khắc phục:**
- Truy vấn `PaymentTransaction` theo đúng danh sách `InvoiceID` của các bản ghi `Payment` trên trang hiện tại (`where: { InvoiceID: { in: pageInvoiceIds } }`), đảm bảo mọi bút toán thu/hoàn của từng hóa đơn trên trang luôn hiển thị đầy đủ.
- Trả kèm đối tượng `summary` tính toán toàn cục trên server (`totalNet`, `totalVietQr`, `totalCashAndCard`, `totalRefunded`, `pendingVietQrCount`) để KPI trên `PaymentsLedgerPage` luôn chính xác bất kể đang xem trang nào.

**Trạng thái nghiệm thu:** Transaction theo trang và KPI toàn cục đã đồng bộ; KPI hiện đọc toàn bộ Payment vào RAM mỗi request, xem review lại ở đầu file.

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

### P2-02 — Nút đối soát VietQR chưa thực hiện đối soát thật — ⚠ CÒN NHÃN GÂY HIỂU NHẦM

**Vị trí:** `frontend/src/pages/PaymentsLedgerPage.tsx`; `frontend/src/pages/PosTerminalPage.tsx`.

**Đã khắc phục:**
- Đổi nhãn và luồng thao tác trên `PaymentsLedgerPage.tsx` và `PosTerminalPage.tsx` thành **Đối soát thủ công VietQR** yêu cầu nhập mã tham chiếu giao dịch ngân hàng (`ReferenceCode` / `FT...`) và gọi trực tiếp API `POST /api/invoices/:id/pay-debt` để ghi sổ thật.

**Trạng thái nghiệm thu:** Luồng nhập mã và ghi sổ thủ công đã có; một số nhãn còn gọi là tự động/Napas247 dù chưa tích hợp ngân hàng, xem review lại ở đầu file.

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
