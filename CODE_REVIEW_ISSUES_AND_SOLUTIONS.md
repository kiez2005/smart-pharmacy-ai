# PharmaCore ERP — Các vấn đề và hướng xử lý đề xuất

**Ngày rà soát:** 11/11/2026  
**Phạm vi:** Phân khu 1 (quản trị kho/dược phẩm) và phân khu 2 (POS, online, hóa đơn, thanh toán, khách hàng).  
**Cách dùng tài liệu:** Đây là đánh giá code hiện tại và đề xuất nghiệp vụ/kỹ thuật để đưa vào backlog. Mức ưu tiên phản ánh rủi ro vận hành, kho, tiền và an toàn thuốc; không phải tuyên bố hệ thống đã tuân thủ mọi quy định pháp luật.

## Tóm tắt điều hành

Luồng cần thiết kế lại trước tiên là bán online: hiện trang khách và màn hình điều phối nằm trong một trang nội bộ, đặt hàng gọi API lập hóa đơn và trừ tồn ngay. Thiết kế đích nên tách **đơn yêu cầu** khỏi **hóa đơn**, giữ hàng tạm có hạn, để nhân viên/dược sĩ duyệt, rồi mới chốt bán và thanh toán.

Quy tắc cạnh tranh tồn kho đề xuất: **đơn nào được backend giữ đủ toàn bộ số lượng thành công trước thì được ưu tiên**. Không lấy thời điểm khách nhấn nút trên trình duyệt làm căn cứ vì mạng trễ và retry có thể đảo thứ tự. Khi tồn cuối cùng bị tranh chấp, thao tác giữ kho nguyên tử tại DB sẽ tuần tự hóa kết quả; đơn còn lại nhận thông báo hết hàng/được đề nghị chờ hàng. Giữ kho phải hết hạn tự động nếu nhân viên không duyệt kịp.

| Ưu tiên | Ý nghĩa |
|---|---|
| P0 | Có thể bán vượt kho, ghi nhận sai tiền/công nợ hoặc phát sinh rủi ro an toàn thuốc; cần xử lý trước khi dùng thật. |
| P1 | Có thể làm hỏng quy trình bán hàng/đặt hàng, thất thoát hoặc trải nghiệm khách nghiêm trọng. |
| P2 | Sai lệch vận hành, báo cáo, dữ liệu hoặc gây nhầm lẫn; cần xử lý trong đợt hoàn thiện kế tiếp. |

## Danh sách vấn đề và cách giải quyết

### 1. Khách không thể đặt đơn online từ bên ngoài — P1

**Hiện trạng:** Cửa hàng và điều phối cùng nằm trong `OnlineStorePage`; tạo đơn gọi API hóa đơn yêu cầu JWT nhân viên. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L41), [invoice.routes.ts](backend/src/routes/invoice.routes.ts#L16).

**Tình huống doanh nghiệp hay gặp:** Cửa hàng gọi một trang “online” là kênh khách hàng nhưng thực tế chỉ nhân viên dùng được; khách phải gọi điện hoặc nhân viên nhập hộ, gây nhập trùng và không có lịch sử tự phục vụ.

**Hướng xử lý:** Tạo storefront và trang theo dõi đơn riêng cho khách. Tách API tạo order cho khách khỏi API hóa đơn nội bộ. Khách có thể đặt bằng tài khoản hoặc đơn khách vãng lai được xác minh qua OTP; endpoint tra cứu chỉ trả đơn thuộc tài khoản/số điện thoại đã xác minh. Màn hình nhân viên là khu vực riêng có RBAC.

**Hoàn tất khi:** Khách chưa có phiên nhân viên vẫn gửi được đơn; không thể đọc đơn người khác; nhân viên nhìn thấy đơn mới trong hàng chờ.

### 2. Biểu mẫu dùng sẵn danh tính/địa chỉ giả — P1

**Hiện trạng:** Tên, số điện thoại, địa chỉ và ghi chú mặc định đang được điền sẵn bằng dữ liệu mẫu. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L54).

**Hướng xử lý:** Bỏ dữ liệu giả khỏi luồng thật. Với khách đăng nhập, nạp thông tin đã lưu nhưng yêu cầu xác nhận người nhận/địa chỉ cho từng đơn; với khách vãng lai, để trống và yêu cầu nhập. Chuẩn hóa số điện thoại, địa chỉ, phường/xã; lưu snapshot địa chỉ trên đơn để thay đổi hồ sơ sau này không làm đổi đơn cũ.

**Hoàn tất khi:** Không thể gửi đơn với thông tin mẫu; dữ liệu người nhận trên đơn độc lập với hồ sơ khách về sau.

### 3. Đơn online trừ kho và trở thành hóa đơn trước khi duyệt — P0

**Hiện trạng:** Khi khách đặt, API chạy luồng lập hóa đơn/trừ kho rồi mới đánh dấu giao vận `PENDING`. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L256), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L102), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L234).

**Tình huống hay gặp:** Đơn chờ duyệt, đơn spam hoặc đơn sau đó bị từ chối đã làm giảm tồn bán được; nhân viên phải xử lý hoàn kho thủ công, có thể quên hoặc hoàn sai.

**Hướng xử lý:** Tạo thực thể `Order`/`OrderLine` riêng với trạng thái `PENDING_REVIEW`. Không tạo hóa đơn bán cuối cùng khi khách mới gửi yêu cầu. Tại bước nhân viên duyệt, tính lại giá, kiểm tồn, kiểm tra an toàn thuốc và chuyển đơn thành `CONFIRMED`; trong một transaction, chuyển lượng giữ thành lượng xuất kho và tạo hóa đơn. Nếu bị từ chối/hủy, giải phóng giữ kho; không tạo bút toán bán.

**Lưu ý:** Có thể giữ hàng ngay khi nhận yêu cầu để giảm nguy cơ khách bị từ chối vì hết hàng, nhưng phải là **reservation có hạn**, không phải trừ tồn bán thật. Microsoft Dynamics mô tả reservation như cách ngăn đơn khác lấy phần hàng đã phân bổ và hỗ trợ chính sách “first ordered, first delivered” ([Microsoft Learn: Reserve inventory quantities](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/reserve-inventory-quantities)).

### 4. Đơn khách và thao tác nhân viên đang ở chung một màn hình — P1

**Hiện trạng:** Cùng component có chế độ cửa hàng và điều phối, sau đặt hàng lại chuyển người dùng sang điều phối. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L41), [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L283).

**Hướng xử lý:** Tách route/layout: `/store` và `/my-orders` cho khách; `/staff/orders` cho nhân viên. Khách chỉ gửi, hủy theo chính sách và xem tiến độ. Nhân viên mới xác nhận, từ chối, đóng gói, bàn giao shipper, xác nhận giao/thu tiền. Gắn quyền cho từng API, không chỉ ẩn nút ở frontend.

### 5. Hai đơn cùng tranh hộp cuối — thiếu cơ chế giữ kho cạnh tranh — P0

**Hiện trạng:** Backend đọc tồn rồi ghi số tồn tính từ giá trị vừa đọc; transaction đơn thuần không đảm bảo chống lost update trong mọi cấu hình. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L137), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L155).

**Chính sách đề xuất:**

1. Khi đơn được gửi, backend xác thực giỏ và tạo reservation cho **toàn bộ các dòng hàng một cách nguyên tử**. Nếu có một dòng không đủ thì rollback reservation của cả đơn (tránh giữ lẻ các mặt hàng khác).
2. Đơn nào reservation commit thành công trước thì được ưu tiên. Thứ tự dựa trên thứ tự tuần tự hóa tại DB, không phải đồng hồ trình duyệt. Trả `reservedUntil` cho khách và hiển thị thời hạn giữ.
3. Reservation có thời hạn cấu hình, ví dụ 10 phút để bắt đầu; thời hạn cần chọn theo SLA nhân viên và cấu hình vận hành, không hard-code. Có job hết hạn giải phóng reservation nếu chưa xác nhận.
4. Nếu hai request đến sát nhau và chỉ còn một hộp, chỉ một transaction được giữ hộp. Đơn kia nhận `OUT_OF_STOCK`/`WAITLIST_OFFER`; không âm kho, không tự chuyển thành đơn đã xác nhận.
5. Khi nhân viên duyệt, kiểm lại reservation còn hiệu lực rồi chuyển giữ kho thành xuất bán. Khi từ chối/hủy/hết hạn, giải phóng đúng một lần.
6. Thêm khóa duy nhất/idempotency key cho request đặt hàng để retry mạng không tạo hai đơn hay giữ hai lần. Cùng một key và payload trả lại cùng kết quả; key dùng lại với payload khác phải bị từ chối. Đây là mẫu phổ biến để chống tạo trùng do retry ([Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Shopify: Idempotent requests](https://shopify.dev/docs/api/usage/idempotent-requests)).

**Thiết kế dữ liệu gợi ý:** `InventoryReservation(id, orderId, productId, quantity, status, expiresAt, createdAt)`; unique/constraint phù hợp để giải phóng hoặc chuyển trạng thái một lần. Tồn khả dụng = tồn vật lý − tổng reservation còn hiệu lực. Với bán lẻ lẻ, phải khóa/cập nhật nhất quán cả hộp nguyên và `LooseUnits` trong cùng transaction.

**Nếu không giữ hàng trước khi duyệt:** quy tắc dự phòng là đơn nhân viên xác nhận trước được lấy hàng; đơn sau nhận hết hàng. Đây là lựa chọn ít phức tạp hơn nhưng khách đã gửi yêu cầu vẫn có thể bị từ chối, nên trải nghiệm kém hơn.

### 6. Hoàn tất giao hàng đang bị hiểu thành đã thu tiền — P0

**Hiện trạng:** API đánh dấu hoàn tất sẽ xóa toàn bộ dư nợ của bất kỳ đơn nào còn `DebtAmount`, không phân biệt COD với công nợ B2B. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L322).

**Tình huống hay gặp:** Trạng thái vận chuyển và trạng thái tài chính bị gộp. Nhân viên bấm giao thành công cho đơn đại lý ghi nợ thì hệ thống ghi đã thu đủ, làm sai công nợ và sổ quỹ.

**Hướng xử lý:** Tách `FulfillmentStatus` khỏi `PaymentStatus`. `DELIVERED` không tự xóa nợ. Chỉ ghi nhận thu tiền khi có sự kiện/biên nhận thanh toán; COD cần số tiền shipper thực thu và đối soát; B2B `CREDIT` vẫn nợ cho tới thao tác thu nợ riêng. Với VietQR/đối tác thanh toán, chỉ xác nhận từ webhook đã xác minh chữ ký, xử lý lặp webhook idempotently; không tin vào redirect trình duyệt. Stripe cũng khuyến nghị fulfillment dựa trên sự kiện server-side thay vì trang redirect ([Stripe: Handle post-payment events](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted)).

### 7. Backend cho phép nhảy trạng thái và cập nhật đơn kết thúc — P1

**Hiện trạng:** API kiểm tra giá trị trạng thái nằm trong allowlist, nhưng không kiểm tra chuyển trạng thái từ trạng thái hiện tại; cũng chưa khóa đơn đã hoàn tất/hủy. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L300).

**Hướng xử lý:** Xây state machine ở backend, ví dụ `PENDING_REVIEW → CONFIRMED | REJECTED`; `CONFIRMED → PACKING → READY_FOR_COURIER → SHIPPING → DELIVERED`; nhánh `CANCELLED` theo chính sách. Mỗi chuyển trạng thái phải kiểm tra role, điều kiện, dữ liệu cần thiết (lý do từ chối, mã vận đơn, số tiền COD) và ghi lịch sử actor/time. Dùng cập nhật có điều kiện theo trạng thái cũ để chặn hai nhân viên cập nhật đè nhau.

### 8. Khách chưa có API theo dõi đơn riêng — P1

**Hiện trạng:** Trang tải danh sách hóa đơn toàn cục cho khu vực điều phối; không có lọc theo khách hiện tại. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L73), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L34).

**Hướng xử lý:** API khách chỉ cho phép xem các order gắn với `CustomerID` đã xác thực. Đơn khách vãng lai dùng mã theo dõi ngẫu nhiên đủ khó đoán kèm OTP/điện thoại xác minh, có giới hạn thử và không trả dữ liệu nhạy cảm. Cho khách xem lịch sử trạng thái, ETA nếu có, lý do từ chối và hướng xử lý.

### 9. Giá/tồn/ship hiển thị trên trình duyệt có thể khác giá chốt — P1

**Hiện trạng:** Frontend tự tính giá và phí giao để hiển thị; backend tính giá hàng lại nhưng nhận `ShippingFee` và `VatRate` từ payload. Giỏ/tồn có thể cũ khi nhiều khách cùng thao tác. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L145), [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L229), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L191).

**Hướng xử lý:** Backend là nguồn giá duy nhất: tính giá theo bảng giá/khách hàng/đơn vị bán, khuyến mãi, thuế và phí vận chuyển. Khách gửi địa chỉ + dịch vụ giao; không gửi số phí đáng tin cậy từ client. Khi nhân viên duyệt, trả bản chốt giá/tồn có version và yêu cầu khách đồng ý lại nếu thay đổi. Lưu snapshot giá, quy tắc, thuế, phí và thời điểm tính trên order/invoice để giải trình.

### 10. Thiếu thao tác từ chối/hủy đơn và lý do — P1

**Hiện trạng:** Danh sách điều phối có duyệt/giao/hoàn tất, không có nút từ chối đơn chờ; xử lý hủy nằm ở luồng hóa đơn khác. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L1065), [invoice.routes.ts](backend/src/routes/invoice.routes.ts#L34).

**Hướng xử lý:** Thêm từ chối trước xác nhận và hủy sau xác nhận theo ma trận điều kiện. Bắt buộc chọn/nhập lý do, thông báo khách, giải phóng reservation, hoàn/void thanh toán nếu có, ghi audit log. Sau khi đã giao, dùng luồng trả hàng/hoàn tiền riêng, không xóa giao dịch gốc.

### 11. Hoàn hàng chỉ đổi trạng thái payment, chưa có dòng tiền hoàn — P0

**Hiện trạng:** Hủy hóa đơn đặt `Payment.Status = REFUNDED`, nhưng không ghi số tiền hoàn hoặc một giao dịch chi hoàn riêng; vẫn có thể hoàn cả hóa đơn đã trả một phần/còn nợ. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L486), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L525), [schema.prisma](backend/prisma/schema.prisma#L204).

**Hướng xử lý:** Dùng payment ledger append-only: các dòng `CAPTURE`, `COLLECT_COD`, `DEBT_COLLECTION`, `REFUND`, `VOID`, mỗi dòng có amount, method, external reference, actor, timestamp, status. Hủy đơn tính số tiền thực đã thu, hoàn tối đa số đó; công nợ được đảo riêng. Hỗ trợ hoàn một phần nếu quy trình trả hàng từng dòng. Giữ chứng từ gốc và liên kết chứng từ đảo.

### 12. POS mở với giỏ mẫu — P1

**Hiện trạng:** POS khởi tạo với Panadol giả số lượng 250 hộp. Tham chiếu: [PosTerminalPage.tsx](frontend/src/pages/PosTerminalPage.tsx#L57).

**Hướng xử lý:** Khởi tạo giỏ rỗng; chuyển mọi dữ liệu demo vào seed riêng và gắn cờ môi trường demo rõ ràng. Không có đường đi nào để dữ liệu demo xuất thành giao dịch production.

### 13. Race condition khi bán đồng thời — P0

**Hiện trạng:** Đọc `Product.Quantity`, tính ở ứng dụng rồi ghi giá trị mới; hai request có thể cùng đọc tồn cũ và làm mất một lần trừ. Transaction hiện tại không tự biến read-modify-write thành phép trừ nguyên tử. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L137), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L155).

**Hướng xử lý:** Dùng conditional atomic update/optimistic concurrency với version; chỉ thành công nếu tồn khả dụng đủ. Với đơn nhiều SKU, cập nhật tất cả trong một transaction và rollback toàn bộ khi một dòng thất bại. Trả lỗi xung đột có thể thử tải lại giỏ. SQLite hiện tại cần kiểm tra giới hạn write concurrency; nếu tăng tải/đa chi nhánh, cân nhắc DB server như PostgreSQL và thử tải tranh chấp.

### 14. Hủy/hoàn có thể tính sai tồn khi bán cùng SKU nhiều dòng hoặc dữ liệu legacy — P1

**Hiện trạng:** Hoàn kho dựa trên các trường quantity deduction có thể null ở invoice item cũ; logic fallback đoán theo quantity. Nếu nhiều dòng cùng SKU hoặc tồn thay đổi đồng thời, cần chắc chắn mỗi dòng được đảo chính xác một lần. Tham chiếu: [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L491), [schema.prisma](backend/prisma/schema.prisma#L183).

**Hướng xử lý:** Ghi movement ledger kho append-only với `sourceType/sourceId`, SKU, batch, đơn vị gốc, số lượng base unit và loại movement. Unique constraint ngăn đảo một chứng từ hai lần. Legacy không đủ dữ liệu phải chuyển sang hàng chờ xác minh thủ công, không tự suy luận số hộp. Thực hiện theo nguyên tắc đã mô tả trong [CODE_REVIEW_FIX_PLAN.md](CODE_REVIEW_FIX_PLAN.md) nhưng cần kiểm chứng migration với dữ liệu thực trước khi chạy.

### 15. FEFO/lô/hạn dùng đang được quảng bá nhưng kho hiện cộng gộp — P1

**Hiện trạng:** Phiếu nhập có `BatchNumber`/`ExpiryDate`, nhưng các dòng nhập không phải số dư lô tồn; tạo phiếu nhập chỉ tăng `Product.Quantity`. Bán hàng trừ tồn tổng hợp, không chọn lô; POS còn hiển thị nhãn FEFO mẫu. Tham chiếu: [schema.prisma](backend/prisma/schema.prisma#L133), [enterprise.controller.ts](backend/src/controllers/enterprise.controller.ts#L317), [PosTerminalPage.tsx](frontend/src/pages/PosTerminalPage.tsx#L1027).

**Tình huống hay gặp:** Không truy được thuốc đã xuất từ lô nào, không chặn thuốc hết hạn, không thể thu hồi theo batch và FEFO chỉ là thông tin trang trí.

**Hướng xử lý:** Tạo tồn theo `StockLot` (ProductID, batch, expiry, received quantity, remaining quantity, branch/location, status); receipt nhập làm tăng đúng lot; xuất bán/giữ hàng phân bổ lot theo FEFO (hạn gần nhất còn hợp lệ), lưu allocation trên order line; chặn lô hết hạn/thu hồi. Chỉ dùng FEFO khi dữ liệu lô thật đã được nhập và kiểm kê; bỏ nhãn mẫu cho tới lúc đó.

### 16. Cảnh báo dị ứng/tương tác hiện ở POS nhưng không chặn ở backend và chưa nằm trong duyệt online — P0

**Hiện trạng:** POS gọi kiểm tra tương tác từ frontend, lỗi kiểm tra bị bỏ qua; API tạo hóa đơn không yêu cầu kết quả rà soát. Đơn online cũng không có bước đánh giá an toàn trước khi chốt. Tham chiếu: [PosTerminalPage.tsx](frontend/src/pages/PosTerminalPage.tsx#L131), [PosTerminalPage.tsx](frontend/src/pages/PosTerminalPage.tsx#L138), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L72), [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L239).

**Hướng xử lý:** Cảnh báo lâm sàng phải chạy server-side tại bước dược sĩ duyệt, dựa trên dữ liệu bệnh nhân đã xác minh, toàn bộ giỏ và nguồn dữ liệu tương tác đáng tin cậy. Ghi lại ai đã rà soát, thời điểm, cảnh báo và quyết định/override kèm lý do. Lỗi service không được âm thầm biến thành “an toàn”; đưa đơn vào trạng thái cần rà soát thủ công. Không để cảnh báo AI thay thế quyết định chuyên môn.

**Tham khảo nghiệp vụ:** Hướng dẫn GPhC về dịch vụ dược từ xa yêu cầu quy trình bảo đảm đủ thông tin để đánh giá tính an toàn/phù hợp, cơ hội trao đổi với dược sĩ và lưu trách nhiệm quyết định cung cấp/từ chối. Đây là benchmark quy trình của Anh, không phải kết luận pháp lý cho Việt Nam ([GPhC guidance, 2025](https://assets.pharmacyregulation.org/files/2025-02/gphc-guidance-registered-pharmacies-providing-pharmacy-services-distance-february-2025.pdf)). Cần đối chiếu riêng quy định Việt Nam và SOP của cơ sở.

### 17. Chọn chi nhánh chỉ đổi state giao diện — P1 nếu vận hành nhiều cơ sở

**Hiện trạng:** Selector cập nhật `selectedBranch` và toast, nhưng dữ liệu/API kho và hóa đơn không được lọc theo branch. Tham chiếu: [App.tsx](frontend/src/App.tsx#L76), [App.tsx](frontend/src/App.tsx#L423).

**Hướng xử lý:** Thêm `BranchID` cho lô tồn, reservation, order, invoice, payment và movement; giới hạn API theo branch được cấp quyền. Chuyển cơ sở phải tải lại dữ liệu, kiểm tra quyền server-side và ghi branch snapshot vào chứng từ. Nếu chưa triển khai đa cơ sở, ẩn lựa chọn hoặc đánh dấu demo để tránh thao tác nhầm.

### 18. Retry/double click có thể tạo đơn hoặc thao tác nghiệp vụ lặp — P1

**Hiện trạng:** Frontend có trạng thái `submitting`, nhưng API tạo đơn không có idempotency key; retry do timeout hoặc hai tab vẫn có thể tạo đơn trùng. Các endpoint đổi trạng thái/thu nợ cũng cần bảo đảm lặp request không cộng/trừ hai lần. Tham chiếu: [OnlineStorePage.tsx](frontend/src/pages/OnlineStorePage.tsx#L254), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L72), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L383).

**Hướng xử lý:** Dùng idempotency key có unique constraint lưu trong DB, gắn với actor/guest session và fingerprint payload. Tạo đơn, giữ kho, thu nợ, hoàn tiền đều phải idempotent ở server. Webhook thanh toán lưu event ID duy nhất và xử lý trong transaction. Không chỉ dựa vào disable button phía client.

### 19. Hóa đơn thiếu dấu vết người lập/người duyệt — P2

**Hiện trạng:** Schema có `Invoice.UserID` nhưng `createInvoice` không gắn `req.user.UserID`; bước duyệt cũng không lưu người xác nhận. Khó truy nguyên ai lập, ai duyệt hoặc ai hoàn tiền. Tham chiếu: [schema.prisma](backend/prisma/schema.prisma#L175), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L236), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L344).

**Hướng xử lý:** Ghi actor và timestamp cho mọi quyết định/tác vụ tài chính, lưu audit log không cho sửa/xóa thông thường. Phân tách quyền cashier, pharmacist, admin theo thao tác; với quyết định dược lâm sàng ghi rõ dược sĩ chịu trách nhiệm.

### 20. Chi nhánh / người dùng mặc định có thể tạo cảm giác đã đăng nhập — P1

**Hiện trạng:** App khởi tạo một hồ sơ ADMIN mặc định nếu local storage không có user. Tham chiếu: [App.tsx](frontend/src/App.tsx#L79).

**Hướng xử lý:** Không gán danh tính/quyền mặc định. Nếu thiếu token hợp lệ, chuyển đến đăng nhập. Ẩn thao tác nhân viên khi chưa xác thực và vẫn kiểm tra quyền ở backend. Dữ liệu demo phải nằm ở chế độ demo tách biệt, không cấp quyền thật.

### 21. Công nợ và thanh toán bị gộp vào một payment trên mỗi hóa đơn — P1

**Hiện trạng:** `Payment.InvoiceID` là unique nên chỉ có một payment record cho cả hóa đơn; thu nợ từng phần chỉ cập nhật tổng paid vào record cũ. Không thể truy đầy đủ nhiều lần thu, nhiều phương thức hay đối soát từng lần. Tham chiếu: [schema.prisma](backend/prisma/schema.prisma#L204), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L423).

**Hướng xử lý:** Một hóa đơn có nhiều payment/collection/refund event. Lưu từng lần thu nợ, COD, VietQR, hoàn tiền với phương thức, chứng từ và người ghi nhận; số dư trên invoice là tổng hợp từ ledger hoặc được cập nhật đồng bộ trong transaction. Thêm báo cáo đối soát theo ngày/ca/chi nhánh.

### 22. Giá sỉ tối thiểu không được kiểm tra nhất quán ở server — P2

**Hiện trạng:** Frontend áp giá sỉ theo ngưỡng, nhưng backend cần xác nhận server-side cả `MinWholesaleQty`, loại khách hàng và đơn vị bán; endpoint nhận `OrderType` do client gửi. Tham chiếu: [packaging.service.ts](backend/src/services/packaging.service.ts#L421), [invoice.controller.ts](backend/src/controllers/invoice.controller.ts#L13).

**Hướng xử lý:** Xác minh khách có loại B2B hợp lệ và chính sách giá áp dụng ở backend; enforce MOQ/giá sỉ khi tính giá. Không tin `OrderType`/giảm giá/thuế từ client; ghi bảng giá/version đã áp dụng trên order.

## Mô hình trạng thái đích đề xuất

| Giai đoạn | Trạng thái | Tồn kho | Tiền |
|---|---|---|---|
| Khách gửi yêu cầu | `PENDING_REVIEW` | Tạo reservation có hạn nếu chọn chính sách giữ hàng | Chưa ghi nhận là đã thu |
| Dược sĩ/nhân viên chấp nhận | `CONFIRMED` | Xác nhận reservation; chốt giá/tồn; tạo invoice hoặc chuyển order thành sale | Thanh toán chờ/đã xác minh theo phương thức |
| Đóng gói | `PACKING` / `READY_FOR_COURIER` | Kho đã phân bổ theo lô; chưa được xuất nhầm cho đơn khác | Không đổi trạng thái tiền |
| Bàn giao | `SHIPPING` | Ghi movement xuất kho và mã vận đơn tại điểm giao cho vận chuyển | COD vẫn phải thu; credit vẫn là công nợ |
| Giao thành công | `DELIVERED` | Hoàn tất fulfillment | Chỉ ghi COD khi có đối soát/biên nhận thực thu |
| Từ chối/hết hạn/hủy | `REJECTED` / `EXPIRED` / `CANCELLED` | Giải phóng reservation đúng một lần; nếu đã xuất thì cần return movement | Void/hoàn tiền theo số thực thu; ghi lý do |

Trạng thái vận hành và trạng thái tài chính phải độc lập. Ví dụ: đơn có thể `DELIVERED` nhưng COD chưa đối soát; đơn B2B có thể giao xong nhưng vẫn `PARTIALLY_PAID`.

## Kế hoạch triển khai theo pha

### Pha 0 — Chặn rủi ro dữ liệu/tiền

- POS khởi tạo giỏ rỗng; bỏ quyền ADMIN mặc định.
- Sửa ghi nhận COD và công nợ B2B; không xóa nợ khi chỉ cập nhật giao hàng.
- Thêm idempotency cho tạo order, thu nợ, hoàn tiền và đổi trạng thái.
- Ghi payment/refund ledger và actor của giao dịch.
- Bảo vệ tồn kho bằng atomic update/version; từ chối vượt tồn.

### Pha 1 — Tách đơn online và reservation

- Thêm Order/OrderLine, reservation, thời hạn và job giải phóng hết hạn.
- Tạo trang khách riêng và API khách; tạo hàng chờ riêng cho nhân viên.
- Thêm workflow duyệt/từ chối/hủy và audit trail.
- Chốt lại giá/tồn tại thời điểm duyệt; gửi khách xác nhận khi thay đổi.

### Pha 2 — An toàn thuốc và fulfillment

- Tích hợp rà soát dị ứng/tương tác trong backend và bước dược sĩ duyệt.
- Bổ sung trạng thái đóng gói, vận chuyển, giao, COD đối soát; webhook/payment reconciliation.
- Thêm theo dõi đơn của khách, thông báo và xử lý khi giao thất bại.

### Pha 3 — Kho lô, FEFO, đa chi nhánh

- Mô hình tồn theo batch/hạn dùng và movement ledger.
- Phân bổ FEFO thật, chặn lô hết hạn/thu hồi.
- Gắn tồn, reservation, order, invoice và payment với branch; phân quyền branch.
- Chỉ bật nhãn FEFO/đa chi nhánh khi dữ liệu và nghiệp vụ đã thực sự hỗ trợ.

## Tiêu chí nghiệm thu nghiệp vụ quan trọng

- Hai khách cùng đặt hộp cuối: đúng một reservation thành công; không âm kho; đơn thua cuộc nhận phản hồi rõ ràng.
- Retry cùng request không tạo order, invoice, reservation, payment hoặc refund thứ hai.
- Reservation hết hạn/từ chối/hủy được giải phóng đúng một lần.
- Giao đơn B2B trả chậm không tự xóa công nợ.
- Chuyển đơn sang delivered không tự ghi COD nếu chưa có xác nhận thu tiền.
- Khách A không xem được đơn của khách B; khách không gọi được API nhân viên.
- Giá/ship/thuế từ client không thể bị sửa để giảm số phải trả.
- Đơn có cảnh báo dị ứng không thể đi tiếp mà không có quyết định dược sĩ được ghi vết.
- Truy được mỗi hộp xuất thuộc lô nào, hạn dùng nào, nhân viên nào và chứng từ nào.
- Hoàn hàng ghi đúng số lượng về đúng lô và hoàn tiền không vượt quá số đã thu.

## Nguồn tham khảo nghiệp vụ/kỹ thuật

- [Microsoft Learn — Reserve inventory quantities](https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/reserve-inventory-quantities): reservation ngăn đơn khác lấy hàng đã phân bổ và có thể cấu hình theo thời điểm/chính sách.
- [Microsoft Learn — Handling concurrency conflicts](https://learn.microsoft.com/en-us/ef/core/saving/concurrency): dùng concurrency control để tránh cập nhật đồng thời gây sai dữ liệu.
- [Stripe Docs — Idempotent requests](https://docs.stripe.com/api/idempotent_requests): retry request tạo/cập nhật không tạo tác dụng phụ trùng.
- [Shopify Docs — Idempotent requests](https://shopify.dev/docs/api/usage/idempotent-requests): mẫu idempotency cho API commerce.
- [Stripe Docs — Handle post-payment events](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted): fulfillment dựa vào sự kiện server-side; redirect của trình duyệt không đủ tin cậy.
- [GPhC — Guidance for registered pharmacies providing pharmacy services at a distance (2025)](https://assets.pharmacyregulation.org/files/2025-02/gphc-guidance-registered-pharmacies-providing-pharmacy-services-distance-february-2025.pdf): tham khảo về kiểm tra phù hợp, trách nhiệm dược sĩ, lưu quyết định và dịch vụ dược từ xa; thuộc bối cảnh Anh, cần đối chiếu quy định Việt Nam riêng.

## Phạm vi và giới hạn

Đây là review tĩnh theo code hiện có, tập trung vào các luồng đã được kiểm tra trong phân khu 1 và 2; không phải kiểm toán toàn bộ hệ thống hay ý kiến pháp lý. Tài liệu này là đối chiếu implementation hiện tại với các kế hoạch đã có, không mặc định các kế hoạch đó đã được triển khai hoặc kiểm chứng. Các đề xuất về thuốc bán theo đơn, tư vấn, dữ liệu sức khỏe, hóa đơn điện tử, thuế và bảo vệ dữ liệu cần được đối chiếu với quy định Việt Nam hiện hành và quy trình chuyên môn của nhà thuốc trước khi phát hành production.
