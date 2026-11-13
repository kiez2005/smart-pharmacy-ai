# Kế hoạch xử lý tồn đọng: Smart Pharmacy AI

**Ngày rà soát:** 13/11/2026  
**Phạm vi:** Backend API (`:5000`), cổng ERP/dược sĩ (`:5173`), storefront khách hàng (`:5174`).  
**Mục tiêu:** xử lý rủi ro an toàn thuốc, bảo mật và dữ liệu trước; sau đó sửa luồng giao diện và tối ưu tốc độ bằng công nghệ miễn phí, mã nguồn mở.

## Tóm tắt

Ứng dụng đã có một số nền tảng tốt: API định giá phía server, giữ chỗ tồn kho, cập nhật tồn kho có điều kiện, ghi nhận biến động kho/thanh toán, state machine cho đơn, và đăng ký tài khoản không tự kích hoạt quyền. Tuy nhiên, còn các đường đi có thể bỏ qua kiểm tra dị ứng, giả danh khách hàng để tạo công nợ, sai truy xuất lô thuốc, hoặc phát lại thao tác đồng thời. Đây là ưu tiên cao hơn việc đổi framework.

Đăng nhập ERP đã được thêm vào `frontend/src/App.tsx` và `frontend/src/pages/LoginPage.tsx`; trang đăng nhập đã được mở kiểm tra trực quan. Đây là thay đổi mới, cần kiểm tra thêm luồng đăng nhập, hết hạn phiên và phân quyền sau khi chạy các luồng thực tế.

Build hiện tại: ERP, storefront và backend đều build/biên dịch thành công. Bundle ERP chính khoảng **772.81 kB minified (184.90 kB gzip)**, vượt cảnh báo Vite 500 KiB. Storefront khoảng **319.31 kB**. Hai script chấp nhận hiện có đạt **10/10** và **5/5** trên bản sao DB; chúng chưa kiểm tra các race condition, quyền truy cập và truy xuất lô nêu dưới đây.

## Danh sách cần xử lý theo mức ưu tiên

| ID | Ưu tiên | Khu vực | Vấn đề và tác động | Cách xử lý / điều kiện hoàn tất |
|---|---|---|---|---|
| S1 | P0 | Backend / POS | Cashier có thể dùng ghi chú tự do để vượt chặn dị ứng/chống chỉ định; kiểm tra hiện chủ yếu xác nhận có ghi chú đủ dài. | Chỉ pharmacist/admin có quyền override; bắt buộc chọn lý do chuẩn hóa, ghi người duyệt/thời điểm/cảnh báo vào audit log. Cashier không thể override. Kiểm tra API và UI đều từ chối đúng. |
| S2 | P0 | Backend / đơn online | Dị ứng khách khai báo được lưu trong chuỗi `Note`; lúc duyệt đơn, kiểm tra an toàn không nhận thông tin này nên có thể duyệt qua cảnh báo. | Lưu khai báo dị ứng vào trường/bảng có cấu trúc; đưa vào đánh giá cả lúc tạo lẫn lúc duyệt. Có test guest và tài khoản khách, dị ứng trùng hoạt chất và override có phân quyền. |
| S3 | P0 | Backend / AI | AI và clinical safety dùng heuristic/từ khóa, có thể gợi ý sai hoặc bỏ sót tương tác. | Gắn nhãn rõ “tham khảo, không thay thế dược sĩ”; không dùng điểm tương đồng giả lập làm quyết định lâm sàng. Thêm nguồn dữ liệu tương tác/hoạt chất được quản lý, phiên bản dữ liệu và audit; mọi cảnh báo nguy cơ cao cần pharmacist review. |
| A1 | P1 | Backend / đơn công khai | API tạo đơn nhận `CustomerID` tùy ý; người ngoài có thể mạo danh khách có hạn mức công nợ/giá sỉ và làm phát sinh nợ khi dược sĩ duyệt. | Không nhận CustomerID tùy ý từ guest. Chỉ gắn danh tính sau xác thực và kiểm tra quyền sở hữu; guest phải dùng luồng guest, không được hưởng credit/giá sỉ. Kiểm thử IDOR và công nợ. |
| A2 | P1 | Backend / idempotency | Kiểm tra idempotency và ghi nhận khóa nằm ngoài transaction nghiệp vụ; hai request đồng thời có thể cùng vượt qua bước đọc và tạo hai đơn/hóa đơn. | Ràng buộc UNIQUE ở DB trên khóa + phạm vi người dùng/endpoint; ghi khóa và nghiệp vụ trong transaction. Test song song cùng khóa chỉ tạo đúng một kết quả. |
| D1 | P1 | Backend / kho | FEFO có thể trừ nhiều lô nhưng chỉ trả dữ liệu lô đầu; thiếu hàng vẫn có thể tạo lô giả/ngày hết hạn mặc định. Hoàn/trả có thể cộng sai lô, mất truy xuất thu hồi. | Dùng bảng phân bổ `InvoiceItemLot`/`OrderItemLot` với một dòng mỗi lô; giao dịch phải thất bại nếu tổng lô khả dụng không đủ; bỏ tạo lô giả và ngày hết hạn mặc định. Hoàn kho đảo đúng từng phân bổ. |
| A3 | P1 | Backend / bảo mật phiên | Middleware tin role/status trong JWT đến hết hạn; tài khoản bị khóa hoặc hạ quyền vẫn giữ token cũ (tối đa 7 ngày). | Kiểm tra trạng thái tài khoản/phiên và quyền hiện hành, hoặc dùng token ngắn hạn + cơ chế thu hồi/phiên. Test vô hiệu hóa tài khoản và đổi role khi token cũ còn hạn. |
| A4 | P1 | Backend / API công khai | Chưa có giới hạn tần suất rõ cho đăng ký, đăng nhập, tạo đơn, tra cứu và hủy đơn; tăng rủi ro dò mã, brute force và spam. | Thêm rate limit theo IP và định danh phù hợp, giới hạn body/ảnh, log sự kiện bất thường; trả lỗi không tiết lộ dữ liệu. Tải thử các endpoint công khai. |
| A5 | P1 | Backend / dữ liệu cá nhân | Mã đơn tạo từ thời gian và một chữ số ngẫu nhiên; tra cứu/hủy dựa trên mã + điện thoại/token có nguy cơ dò. Ảnh đơn thuốc nhúng base64 vào `Note`, khó kiểm soát dung lượng và truy cập. | Dùng mã ngẫu nhiên đủ entropy, token tra cứu bí mật có TTL/thu hồi, rate limit; xác minh OTP nếu cần. Đưa file sang upload có giới hạn MIME/kích thước và lưu trữ riêng tư; không nhúng base64 trong ghi chú. |
| A6 | P1 | Backend / catalog | Catalog công khai trả số lượng tồn, lô, hạn dùng, dữ liệu đóng gói/giá nội bộ. | Dùng DTO public allowlist chỉ chứa dữ liệu khách cần; không trả tồn theo lô, tồn chính xác, giá sỉ hay trường quản trị. Kiểm tra response API bằng snapshot/schema test. |
| A7 | P1 | Backend / cấu hình | CORS đang mở rộng (`cors()` không cấu hình origin). | Chỉ cho phép origin storefront/ERP theo môi trường; cấu hình security headers và cookie/token phù hợp. Test origin không được phép bị từ chối. |
| U1 | P1 | ERP | Có các màn `AI_OCR`, `AI_CLINICAL`, `CONTACT` nhưng không thấy mục điều hướng nên người dùng không tìm/mở được. | Thêm mục điều hướng theo quyền, hoặc bỏ các màn chưa dùng; đảm bảo active state, breadcrumb và quyền truy cập nhất quán. |
| U2 | P1 | ERP / kiến trúc sản phẩm | Sidebar có “Cổng Khách Hàng Online” và toolbar “Bán thuốc Online” dẫn tới trang nội bộ, trong khi storefront thật đã chạy ở `:5174`; STAFF_ORDERS là luồng nhân viên xử lý đơn online. | Gỡ mục storefront nội bộ trùng lặp hoặc đổi thành preview có nhãn rõ. Gom điều hướng thành “Đơn online” cho nhân viên; nút storefront mở `:5174`. Không nhầm cửa hàng khách với hàng đợi duyệt đơn. |
| U3 | P1 | ERP | Chọn chi nhánh là state giao diện nhưng không được dùng để lọc API/dữ liệu; có thể khiến nhân viên tưởng đang thao tác đúng chi nhánh. Đồng bộ cổng quốc gia chỉ chờ giả lập rồi báo thành công. | Nếu chưa hỗ trợ đa chi nhánh/tích hợp, bỏ selector/nút hoặc ghi rõ demo. Nếu triển khai, chi nhánh phải đi xuyên suốt quyền, truy vấn, tồn kho và hóa đơn; đồng bộ chỉ báo thành công khi backend xác nhận. |
| U4 | P1 | Storefront / dữ liệu | Trang công khai hiển thị nhiều bản ghi thử nghiệm/trùng lặp như “Thuốc Kiểm Thử…”, “Release Once”, “Chống Can Thiệp Giá Server”. | Tách seed/test khỏi dữ liệu thật; thêm trạng thái publish/ẩn và lọc server-side. Chỉ sản phẩm đã duyệt mới xuất hiện công khai. |
| U5 | P2 | Storefront | Header chiếm nhiều chiều cao trên viewport hẹp; tìm kiếm, triệu chứng, đơn thuốc và danh mục cạnh tranh không gian, tạo cảm giác rối. | Ưu tiên tìm kiếm + danh mục; đưa triệu chứng/đơn thuốc vào thao tác rõ ràng, thu gọn bộ lọc trên màn nhỏ; giữ CTA giỏ hàng dễ thấy. Kiểm tra ở viewport desktop và mobile thực tế. |
| P1 | P1 | Backend / quy mô dữ liệu | Catalog và một số màn có thể tải danh sách lớn; thiếu phân trang/giới hạn thống nhất làm tăng thời gian phản hồi và tải trình duyệt. | Thêm pagination, lọc/tìm kiếm server-side, giới hạn page size; chỉ chọn trường cần thiết. Đo query chậm và thêm index theo truy vấn thực tế, xác nhận bằng `EXPLAIN`. |
| P2 | P2 | ERP / hiệu năng | ERP tải bundle chính lớn; nhiều màn không cần thiết có thể cùng tải ban đầu. | Phân tích bundle, lazy-load từng khu vực lớn (OCR, AI, báo cáo, nhập hàng), tách dependency theo nhu cầu. Đo lại bundle khởi đầu và LCP/INP trước-sau. Không chỉ tăng ngưỡng cảnh báo. |

## Công nghệ miễn phí đề xuất

| Hạng mục | Đề xuất | Lý do / lưu ý |
|---|---|---|
| UI và build | Giữ React + Vite; nâng cấp có kiểm tra lên React 19.3.x và Vite 8.3.x ổn định. | Không cần viết lại app. Vite 8 đã ổn định; khóa phiên bản và kiểm tra plugin/peer dependency trước khi nâng. Dùng React `lazy`/dynamic import cho màn nặng. |
| Runtime | Node.js 26 LTS (26.13.0 tại ngày rà soát). | Nhánh LTS có thời gian hỗ trợ dài hơn nhánh Current; không dùng Node 27 alpha cho production. |
| ORM | Nâng Prisma theo từng bước lên bản stable mới nhất tương thích (7.10.1 tại ngày rà soát); chưa dùng Prisma 8 RC. | Tạo migration và backup trước; chạy thử trên bản DB staging/copy. Không đổi ORM trong cùng đợt sửa nghiệp vụ. |
| Database | Giữ SQLite cho demo/triển khai một máy, ít ghi đồng thời. Dùng PostgreSQL 18 cho nhiều nhân viên/chi nhánh và tải ghi đồng thời. | Cả hai miễn phí, mã nguồn mở. PostgreSQL cần công sức vận hành; không tự làm hosting/hạ tầng miễn phí. Thiết kế migration/backup/restore trước khi chuyển. |
| Bảng dài | Dùng TanStack Virtual cho danh sách tồn kho, hóa đơn, đơn hàng dài. | Mã nguồn mở; chỉ render hàng đang nhìn thấy. Kết hợp phân trang server-side, vì virtualization không giảm tải query/backend. |
| Bundle | Dùng công cụ phân tích bundle mã nguồn mở (ví dụ `rollup-plugin-visualizer`), dynamic import và React `lazy`. | Tìm dependency chiếm dung lượng trước khi thay thư viện; giảm JS tải ban đầu. |
| Kiểm tra tốc độ | Lighthouse CLI/Lighthouse CI và Chrome DevTools; theo dõi LCP, INP, CLS, kích thước JS và thời gian API. | Công cụ miễn phí; đặt ngân sách hiệu năng và chạy cùng cấu hình máy/mạng để so sánh công bằng. |
| API server | Giữ Express trong giai đoạn xử lý lỗi nghiệp vụ. Chỉ benchmark Fastify sau khi DB, payload, truy vấn và cache đã tối ưu. | Đổi framework có chi phí tương thích/migration và không tự sửa bottleneck DB hay bundle frontend. Fastify cũng là lựa chọn mã nguồn mở nếu benchmark chứng minh lợi ích. |

**“Miễn phí” ở đây là chi phí license phần mềm bằng 0.** Máy chủ, tên miền, lưu trữ ảnh, điện, mạng và thời gian vận hành vẫn có thể phát sinh chi phí. Không có lựa chọn framework nào bảo đảm trang nhanh nếu query, payload hoặc thiết bị người dùng là nút thắt.

## Lộ trình đề xuất

### P0 — An toàn và ngăn lạm dụng

1. Khóa override cảnh báo lâm sàng cho pharmacist/admin; chuẩn hóa audit log.
2. Đưa dị ứng khách khai báo thành dữ liệu có cấu trúc và kiểm tra ở bước duyệt.
3. Gắn nhãn AI là tham khảo; không cho heuristic tự quyết định duyệt thuốc.
4. Siết CORS, rate limit, quyền token, xác thực guest và giới hạn dữ liệu/file công khai.

**Hoàn tất khi:** cashier không vượt chặn; đơn khách dị ứng luôn được cảnh báo khi duyệt; guest không thể tạo công nợ cho CustomerID khác; token của user bị khóa mất hiệu lực; endpoint công khai có giới hạn.

### P1 — Đúng tồn kho, hóa đơn và đơn online

1. Lưu phân bổ theo từng lô; cấm tồn âm/lô giả; đảo giao dịch hoàn trả theo đúng lô.
2. Đưa idempotency vào ràng buộc DB/transaction và kiểm tra tải đồng thời.
3. Tạo DTO public riêng, mã tra cứu khó đoán, token có hạn và luồng upload riêng.
4. Thêm phân trang và index dựa trên truy vấn đo được.

**Hoàn tất khi:** kiểm thử đồng thời không tạo đơn kép; FEFO và hoàn kho giữ nguyên tổng tồn từng lô; response catalog không lộ dữ liệu nội bộ; truy vấn phổ biến có giới hạn và thời gian đo được.

### P2 — Luồng ERP và storefront

1. Phân biệt rõ storefront khách hàng và hàng đợi nhân viên duyệt đơn; bỏ menu trùng.
2. Hiện các màn cần thiết trong điều hướng, bỏ hoặc triển khai thật selector chi nhánh/đồng bộ đang giả lập.
3. Ẩn seed thử nghiệm khỏi catalog và tinh gọn header/bộ lọc trên màn hẹp.
4. Hoàn thiện luồng đăng nhập, token hết hạn, đăng xuất và role; kiểm tra trực quan ở cả hai cổng.

### P3 — Tối ưu và nâng phiên bản

1. Dùng analyzer tìm nguồn bundle ERP 772.81 kB; lazy-load từng module lớn và đo lại.
2. Nâng Node/React/Vite/Prisma từng thay đổi riêng, khóa lockfile, chạy build và các luồng nghiệp vụ sau mỗi bước.
3. Chọn SQLite hoặc PostgreSQL theo tải thật; không chuyển DB chỉ vì số phiên bản mới.
4. Thêm báo cáo Lighthouse và chỉ số API/query làm baseline; tối ưu dựa trên phép đo.

## Kết quả kiểm tra hiện tại và giới hạn

- `frontend`: build thành công; bundle chính 772.81 kB minified, Vite cảnh báo vượt 500 KiB.
- `storefront`: build thành công; bundle JavaScript khoảng 319.31 kB.
- `backend`: TypeScript build thành công.
- Script kiểm tra 22 phát hiện (10 assertion có trong script) đạt 10/10; script 5 tình huống đạt 5/5 trên DB copy.
- Các script hiện tại kiểm tra một số luồng cơ bản và replay tuần tự; chưa chứng minh an toàn cho đồng thời, quyền role, guest allergy, mạo danh CustomerID hoặc truy xuất nhiều lô.
- Login page mới đã được kiểm tra hiển thị; cần chạy kiểm tra luồng đầy đủ cùng API đang hoạt động.

## Nguồn tham khảo

Ngày tra cứu phiên bản: 13/11/2026. Phiên bản mới có thể thay đổi; kiểm tra lại release ổn định và peer dependencies trước khi nâng.

- [React 19.3 release trên GitHub](https://github.com/facebook/react/releases) — trạng thái phiên bản React.
- [React `lazy` API](https://react.dev/reference/react/lazy) — tải component theo nhu cầu bằng dynamic import và Suspense.
- [Vite releases](https://github.com/vitejs/vite/releases) và [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) — phiên bản ổn định và nền tảng build.
- [Vite performance guide](https://vite.dev/guide/performance) — tối ưu build/dev server.
- [Vite GitHub discussion: chunk trên 500 KiB](https://github.com/vitejs/vite/discussions/9440) — trao đổi cộng đồng về dynamic import, chia bundle và việc không chỉ tăng ngưỡng cảnh báo.
- [TanStack Virtual releases](https://github.com/TanStack/virtual/releases) và [React Virtual documentation](https://tanstack.com/virtual/latest/docs/introduction) — virtualization cho danh sách dài.
- [Node.js releases](https://github.com/nodejs/node/releases) — nhánh LTS và thời gian hỗ trợ.
- [Prisma releases](https://github.com/prisma/prisma/releases) và [Prisma versioning](https://www.prisma.io/docs/orm/more/information/versioning) — phân biệt stable với prerelease.
- [PostgreSQL 18 documentation: indexes](https://www.postgresql.org/docs/18/indexes.html) — lợi ích truy vấn và chi phí ghi/lưu trữ của index.

