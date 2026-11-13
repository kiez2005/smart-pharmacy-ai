import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { packagingService } from '../services/packaging.service';
import {
  checkIdempotency,
  IdempotencyConflictError,
  saveIdempotency,
} from '../services/idempotency.service';
import { evaluateClinicalSafetyServerSide } from '../services/clinical-safety.service';
import { calculateServerShippingFee } from './invoice.controller';

const onlineOrderItemSchema = z.object({
  ProductID: z.coerce.number().int().positive(),
  Quantity: z.coerce.number().int().positive('Số lượng đặt phải >= 1'),
  Unit: z.string().trim().optional(),
  DosageNote: z.string().trim().optional().default('Dược sĩ tư vấn liều dùng khi giao thuốc'),
});

const createOnlineOrderSchema = z.object({
  CustomerID: z.coerce.number().int().positive().nullable().optional(),
  CustomerName: z
    .string()
    .trim()
    .min(2, 'Vui lòng nhập họ tên người nhận hợp lệ (tối thiểu 2 ký tự)'),
  CustomerPhone: z
    .string()
    .trim()
    .regex(/^0\d{9,10}$/, 'Số điện thoại người nhận phải gồm 10-11 chữ số bắt đầu bằng số 0'),
  ShippingAddress: z
    .string()
    .trim()
    .min(10, 'Vui lòng nhập địa chỉ nhận thuốc chi tiết (Số nhà, Đường, Phường/Xã, Quận/Huyện)'),
  OrderType: z.enum(['RETAIL', 'WHOLESALE']).optional().default('RETAIL'),
  ShippingMethod: z
    .enum(['EXPRESS_2H', 'STANDARD', 'GDP_TRUCK'])
    .optional()
    .default('EXPRESS_2H'),
  PaymentMethod: z.enum(['COD', 'VIETQR', 'CREDIT']).optional().default('COD'),
  IncludeVat: z.boolean().optional().default(false),
  PatientAllergies: z.string().trim().optional().default(''),
  PrescriptionImage: z.string().trim().optional(),
  Note: z.string().trim().optional().default(''),
  idempotencyKey: z.string().trim().optional(),
  items: z.array(onlineOrderItemSchema).min(1, 'Giỏ đặt hàng phải có ít nhất 1 sản phẩm'),
});

/**
 * 1. PUBLIC API CHO KHÁCH HÀNG ĐẶT ĐƠN ONLINE + GIỮ KHO NGUYÊN TỬ CÓ THỜI HẠN (POST /api/online-orders)
 * - Không yêu cầu JWT nhân viên (Khách vãng lai hoặc khách có tài khoản đều gửi được).
 * - Không tạo Hóa đơn và không trừ tồn bán thật; chỉ tạo InventoryReservation có thời hạn (ReservedUntil).
 * - Nếu 2 khách tranh hộp cuối cùng: đơn nào commit reservation thành công trước được ưu tiên; đơn sau nhận 409 OUT_OF_STOCK.
 */
export const createCustomerOnlineOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = createOnlineOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Thông tin đặt hàng trực tuyến chưa hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const {
      CustomerID,
      CustomerName,
      CustomerPhone,
      ShippingAddress,
      OrderType,
      ShippingMethod,
      PaymentMethod,
      IncludeVat,
      PatientAllergies,
      Note,
      items,
    } = parsed.data;

    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || parsed.data.idempotencyKey;
    const actorKey = `guest:${CustomerPhone}`;

    const idemCheck = await checkIdempotency(
      rawIdemKey,
      'CREATE_ONLINE_ORDER',
      actorKey,
      parsed.data
    );
    if (idemCheck.hit && idemCheck.body) {
      res.status(idemCheck.statusCode || 201).json(idemCheck.body);
      return;
    }

    const reservationTtlMinutes = Math.max(
      1,
      Number(process.env.RESERVATION_TTL_MINUTES || 15)
    );

    const createdOrder = await prisma.$transaction(async (tx) => {
      // Giải phóng các reservation đã quá hạn trước khi kiểm tra tồn khả dụng
      await packagingService.releaseExpiredReservations(tx);

      let customerRecord = null;
      if (CustomerID) {
        customerRecord = await tx.customer.findUnique({
          where: { CustomerID },
        });
      }

      const isVerifiedWholesaleCustomer = customerRecord?.CustomerType === 'WHOLESALE';
      if (PaymentMethod === 'CREDIT' && !isVerifiedWholesaleCustomer) {
        throw new Error(
          'Phương thức ghi công nợ (CREDIT) chỉ áp dụng cho Đại lý / Phòng khám B2B đã xác thực!'
        );
      }

      // Đánh giá an toàn dược lâm sàng (Dị ứng & Tương tác thuốc) ngay khi tiếp nhận yêu cầu
      const clinicalSafety = await evaluateClinicalSafetyServerSide(
        {
          productIds: items.map((i) => i.ProductID),
          customerId: CustomerID,
          patientAllergiesOverride: PatientAllergies,
        },
        tx
      );

      let subTotal = 0;
      let anyWholesaleLine = isVerifiedWholesaleCustomer && OrderType === 'WHOLESALE';

      const reservedLines: Array<{
        ProductID: number;
        Quantity: number;
        Unit: string;
        UnitPrice: number;
        BaseQtyReserved: number;
        LooseQtyReserved: number;
        DosageNote: string;
      }> = [];

      // Giữ kho nguyên tử cho toàn bộ các dòng hàng (Nếu 1 dòng thất bại -> rollback cả đơn)
      for (const item of items) {
        const resvCalc = await packagingService.reserveStockAtomically(
          item.ProductID,
          item.Unit,
          item.Quantity,
          tx,
          {
            orderType: OrderType,
            isVerifiedWholesaleCustomer,
          }
        );

        if (resvCalc.effectiveOrderType === 'WHOLESALE') {
          anyWholesaleLine = true;
        }

        subTotal += resvCalc.unitPrice * item.Quantity;

        reservedLines.push({
          ProductID: item.ProductID,
          Quantity: item.Quantity,
          Unit: resvCalc.requestedUnit,
          UnitPrice: resvCalc.unitPrice,
          BaseQtyReserved: resvCalc.baseQtyToReserve,
          LooseQtyReserved: resvCalc.looseQtyToReserve,
          DosageNote: item.DosageNote,
        });
      }

      const effectiveOrderType: 'RETAIL' | 'WHOLESALE' = anyWholesaleLine
        ? 'WHOLESALE'
        : 'RETAIL';

      // Tính phí vận chuyển & VAT 5% hoàn toàn từ phía Server (Issue 9)
      const vatAmount = IncludeVat ? Math.round(subTotal * 0.05) : 0;
      const shippingFee = calculateServerShippingFee({
        channel: 'ONLINE',
        orderType: effectiveOrderType,
        shippingMethod: ShippingMethod,
        netMerchandiseAmount: subTotal,
      });
      const totalAmount = subTotal + vatAmount + shippingFee;

      const orderCode = `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}${Math.floor(
        Math.random() * 9 + 1
      )}`;
      const trackingToken = `TRK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const reservedUntil = new Date(Date.now() + reservationTtlMinutes * 60 * 1000);

      const order = await tx.onlineOrder.create({
        data: {
          OrderCode: orderCode,
          TrackingToken: trackingToken,
          OrderType: effectiveOrderType,
          Status: 'PENDING_REVIEW',
          PaymentStatus: 'UNPAID',
          PaymentMethod,
          ...(CustomerID ? { CustomerID } : {}),
          CustomerName,
          CustomerPhone,
          ShippingAddress,
          ShippingMethod,
          SubTotal: subTotal,
          ShippingFee: shippingFee,
          VatAmount: vatAmount,
          Discount: 0,
          TotalAmount: totalAmount,
          PaidAmount: 0,
          Note: [
            PatientAllergies ? `[Dị ứng KH khai báo: ${PatientAllergies}]` : '',
            parsed.data.PrescriptionImage ? `[Toa thuốc đính kèm: ${parsed.data.PrescriptionImage}]` : '',
            Note,
          ]
            .filter(Boolean)
            .join(' ')
            .trim(),
          ReservedUntil: reservedUntil,
          ClinicalSafetyStatus: clinicalSafety.status,
          ClinicalWarningsJson: JSON.stringify(clinicalSafety.warnings),
          items: {
            create: reservedLines,
          },
        },
        include: {
          items: { include: { product: true } },
        },
      });

      // Tạo bản ghi InventoryReservation + StockMovement(RESERVE) cho từng dòng
      for (const createdItem of order.items) {
        await tx.inventoryReservation.create({
          data: {
            OrderID: order.OrderID,
            OrderItemID: createdItem.OrderItemID,
            ProductID: createdItem.ProductID,
            Unit: createdItem.Unit,
            Quantity: createdItem.Quantity,
            BaseQtyReserved: createdItem.BaseQtyReserved,
            LooseQtyReserved: createdItem.LooseQtyReserved,
            Status: 'ACTIVE',
            ExpiresAt: reservedUntil,
          },
        });

        await tx.stockMovement.create({
          data: {
            ProductID: createdItem.ProductID,
            SourceType: 'ONLINE_ORDER',
            SourceID: order.OrderID,
            LineItemID: createdItem.OrderItemID,
            MovementType: 'RESERVE',
            Unit: createdItem.Unit,
            Quantity: createdItem.Quantity,
            BaseQtyDelta: -createdItem.BaseQtyReserved,
            LooseQtyDelta: -createdItem.LooseQtyReserved,
            ActorName: CustomerName,
            Note: `Giữ kho tạm có hạn đến ${reservedUntil.toISOString()} cho đơn ${order.OrderCode}`,
          },
        });
      }

      return tx.onlineOrder.findUniqueOrThrow({
        where: { OrderID: order.OrderID },
        include: {
          items: { include: { product: true } },
          reservations: true,
        },
      });
    });

    const responseBody = {
      success: true,
      message: `Đã tiếp nhận yêu cầu đặt hàng ${createdOrder.OrderCode} và giữ thuốc tạm thời đến ${new Date(
        createdOrder.ReservedUntil!
      ).toLocaleTimeString('vi-VN')} chờ Dược sĩ duyệt!`,
      data: createdOrder,
    };

    await saveIdempotency(
      idemCheck.compositeKey,
      'CREATE_ONLINE_ORDER',
      actorKey,
      idemCheck.payloadHash,
      201,
      responseBody
    );

    res.status(201).json(responseBody);
  } catch (error: any) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    const isOutOfStock = error?.code === 'OUT_OF_STOCK';
    res.status(error?.statusCode || 400).json({
      success: false,
      code: error?.code || 'ONLINE_ORDER_ERROR',
      waitlistAvailable: isOutOfStock,
      message: error instanceof Error ? error.message : 'Không thể tạo đơn đặt hàng trực tuyến',
    });
  }
};

/**
 * 2. PUBLIC API TRA CỨU ĐƠN HÀNG DÀNH RIÊNG CHO KHÁCH HÀNG (GET /api/online-orders/track)
 * Giải quyết Issue 1 & Issue 8:
 * - Khách chỉ xem được đúng đơn của mình khi cung cấp khớp OrderCode + (CustomerPhone hoặc TrackingToken).
 * - Tuyệt đối không lộ danh sách đơn của khách hàng khác!
 */
export const trackCustomerOnlineOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations();

    const orderCode = String(req.query.orderCode || '').trim().toUpperCase();
    const phoneOrToken = String(req.query.phoneOrToken || '').trim();
    const phone = String(req.query.phone || '').trim();
    const trackingToken = String(req.query.trackingToken || '').trim().toUpperCase();

    if (!orderCode || (!phone && !trackingToken && !phoneOrToken)) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Mã đơn hàng (ORD-...) kèm Số điện thoại hoặc Mã tra cứu (TRK-...)',
      });
      return;
    }

    const order = await prisma.onlineOrder.findUnique({
      where: { OrderCode: orderCode },
      include: {
        items: {
          include: {
            product: {
              select: {
                ProductID: true,
                ProductName: true,
                PathImage: true,
                Unit: true,
              },
            },
          },
        },
        reservations: true,
        invoice: {
          select: {
            InvoiceID: true,
            InvoiceCode: true,
            FulfillmentStatus: true,
            PaymentStatus: true,
            TotalAmount: true,
            PaidAmount: true,
            DebtAmount: true,
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn hàng hoặc thông tin xác thực không khớp',
      });
      return;
    }

    const phoneMatches =
      (phone && order.CustomerPhone.trim() === phone) ||
      (phoneOrToken && order.CustomerPhone.trim() === phoneOrToken);
    const tokenMatches =
      (trackingToken && order.TrackingToken.toUpperCase() === trackingToken) ||
      (phoneOrToken && order.TrackingToken.toUpperCase() === phoneOrToken.toUpperCase());

    if (!phoneMatches && !tokenMatches) {
      res.status(403).json({
        success: false,
        message: 'Số điện thoại hoặc mã tra cứu không khớp với đơn hàng này!',
      });
      return;
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tra cứu tiến độ đơn hàng',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 3. PUBLIC API KHÁCH HÀNG TỰ HỦY ĐƠN KHI ĐANG CHỜ DUYỆT (POST /api/online-orders/:id/customer-cancel)
 */
export const customerCancelOnlineOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const { phone, trackingToken, phoneOrToken, reason } = req.body as {
      phone?: string;
      trackingToken?: string;
      phoneOrToken?: string;
      reason?: string;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.onlineOrder.findUnique({
        where: { OrderID: orderId },
        include: { reservations: true },
      });

      if (!order) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      const phoneMatches =
        (phone && order.CustomerPhone.trim() === phone.trim()) ||
        (phoneOrToken && order.CustomerPhone.trim() === phoneOrToken.trim());
      const tokenMatches =
        (trackingToken && order.TrackingToken.toUpperCase() === trackingToken.trim().toUpperCase()) ||
        (phoneOrToken && order.TrackingToken.toUpperCase() === phoneOrToken.trim().toUpperCase());

      if (!phoneMatches && !tokenMatches) {
        const err: any = new Error('Bạn không có quyền hủy đơn hàng của người khác!');
        err.statusCode = 403;
        throw err;
      }

      if (order.Status !== 'PENDING_REVIEW') {
        throw new Error(
          `Chỉ có thể tự hủy khi đơn đang ở trạng thái Chờ duyệt (PENDING_REVIEW). Trạng thái hiện tại: ${order.Status}`
        );
      }

      for (const resv of order.reservations) {
        await packagingService.releaseReservationOnce(resv.ReservationID, 'RELEASED', tx, {
          userName: order.CustomerName,
        });
      }

      return tx.onlineOrder.update({
        where: { OrderID: orderId },
        data: {
          Status: 'CANCELLED',
          PaymentStatus: 'VOID',
          RejectCancelReason: reason?.trim() || 'Khách hàng chủ động hủy yêu cầu đặt thuốc',
        },
        include: {
          items: { include: { product: true } },
          reservations: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã hủy đơn ${updated.OrderCode} và giải phóng giữ kho thành công`,
      data: updated,
    });
  } catch (error: any) {
    res.status(error?.statusCode || 400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể hủy đơn hàng',
    });
  }
};

/**
 * 0. PUBLIC STOREFRONT CATALOG API (GET /api/online-orders/catalog)
 * Trả về danh mục thuốc công khai cho Cổng Khách hàng Trực tuyến (Port 5174)
 * Chỉ trả về tồn kho khả dụng (Physical - Reserved) & quy cách, KHÔNG lộ dữ liệu giá vốn nội bộ
 */
export const getPublicStorefrontCatalog = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations().catch(() => 0);

    const search = String(req.query.search || '').trim().toLowerCase();
    const type = String(req.query.type || '').trim();
    const todayIso = new Date().toISOString().slice(0, 10);

    const products = await prisma.product.findMany({
      where: {
        ...(type && type !== 'ALL' ? { ProductType: type } : {}),
      },
      include: {
        packaging: true,
        stockLots: {
          where: { Status: 'ACTIVE', RemainingQuantity: { gt: 0 }, ExpiryDate: { gte: todayIso } },
          orderBy: [{ ExpiryDate: 'asc' }, { LotID: 'asc' }],
          select: {
            LotID: true,
            ProductID: true,
            BatchNumber: true,
            ExpiryDate: true,
            RemainingQuantity: true,
            Status: true,
          },
        },
      },
      orderBy: { ProductID: 'asc' },
    });

    const filtered = search
      ? products.filter(
          (p) =>
            p.ProductName.toLowerCase().includes(search) ||
            p.Description.toLowerCase().includes(search) ||
            p.ProductType.toLowerCase().includes(search)
        )
      : products;

    const sanitized = filtered.map((p) => {
      const reservedBase = p.packaging?.ReservedBaseQty || 0;
      const availableQty = Math.max(0, p.Quantity - reservedBase);
      const isRx =
        p.ProductType.toLowerCase().includes('kháng sinh') ||
        p.ProductType.toLowerCase().includes('tim mạch') ||
        p.ProductType.toLowerCase().includes('thần kinh') ||
        /augmentin|nexium|lipitor|glucophage|amoxicillin|cefuroxim|azithromycin/i.test(p.ProductName);

      return {
        ProductID: p.ProductID,
        ProductName: p.ProductName,
        PathImage: p.PathImage,
        ProductType: p.ProductType,
        Quantity: p.Quantity,
        AvailableQuantity: availableQty,
        Unit: p.Unit,
        Price: p.Price,
        Description: p.Description,
        IsRx: isRx,
        CreateDate: p.CreateDate,
        UpdateDate: p.UpdateDate,
        packaging: p.packaging,
        stockLots: p.stockLots,
      };
    });

    res.json({
      success: true,
      data: {
        items: sanitized,
        total: sanitized.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Không thể tải danh mục dược phẩm trực tuyến',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 4. STAFF API: DANH SÁCH HÀNG CHỜ ĐƠN ONLINE CHO DƯỢC SĨ & ĐIỀU PHỐI (GET /api/online-orders)
 */
export const listOnlineOrdersForStaff = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations();

    const statusFilter = String(req.query.status || '').trim();
    const orders = await prisma.onlineOrder.findMany({
      where: {
        ...(statusFilter && statusFilter !== 'ALL' ? { Status: statusFilter } : {}),
      },
      include: {
        items: { include: { product: true } },
        reservations: true,
        customer: true,
        invoice: {
          include: {
            payment: true,
            paymentTransactions: { orderBy: { CreateDate: 'desc' } },
          },
        },
      },
      orderBy: { CreateDate: 'desc' },
    });

    const formatted = orders.map((o) => {
      let clinicalWarnings: unknown[] = [];
      if (o.ClinicalWarningsJson) {
        try {
          clinicalWarnings = JSON.parse(o.ClinicalWarningsJson);
        } catch {
          clinicalWarnings = [];
        }
      }
      return {
        ...o,
        clinicalWarnings,
      };
    });

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Không thể tải danh sách điều phối đơn đặt hàng Online',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 5. STAFF API (PHARMACIST / ADMIN): DUYỆT HOẶC TỪ CHỐI ĐƠN ONLINE (POST /api/online-orders/:id/review)
 * Giải quyết Issue 3, 5, 10, 16, 18, 19:
 * - Nếu REJECT: bắt buộc nhập lý do, giải phóng giữ kho đúng 1 lần, không tạo hóa đơn bán.
 * - Nếu APPROVE: chạy rà soát dị ứng & tương tác thuốc server-side; nếu có cảnh báo thì bắt buộc có clinicalReviewNote của Dược sĩ;
 *   chuyển lượng giữ kho (Reservation) thành xuất kho thực tế theo Lô FEFO và phát hành Hóa đơn (Invoice) trong cùng 1 transaction!
 */
export const pharmacistReviewOnlineOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const { action, reason, rejectReason, clinicalReviewNote, idempotencyKey } = req.body as {
      action: 'APPROVE' | 'REJECT';
      reason?: string;
      rejectReason?: string;
      clinicalReviewNote?: string;
      idempotencyKey?: string;
    };
    const effectiveReason = (reason || rejectReason || '').trim();

    if (!['APPROVE', 'REJECT'].includes(action)) {
      res.status(400).json({ success: false, message: 'Hành động duyệt phải là APPROVE hoặc REJECT' });
      return;
    }

    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || idempotencyKey;
    const actorKey = req.user ? `user:${req.user.UserID}` : 'pharmacist';

    const idemCheck = await checkIdempotency(
      rawIdemKey,
      `REVIEW_ORDER:${orderId}`,
      actorKey,
      { orderId, action, reason: effectiveReason, clinicalReviewNote }
    );
    if (idemCheck.hit && idemCheck.body) {
      res.status(idemCheck.statusCode || 200).json(idemCheck.body);
      return;
    }

    const actorUserId = req.user?.UserID || null;
    const actorName = req.user?.FullName || 'Dược sĩ Phụ trách';

    const reviewedOrder = await prisma.$transaction(async (tx) => {
      await packagingService.releaseExpiredReservations(tx);

      const order = await tx.onlineOrder.findUnique({
        where: { OrderID: orderId },
        include: {
          items: { include: { product: true } },
          reservations: true,
          customer: true,
        },
      });

      if (!order) {
        throw new Error('Không tìm thấy đơn đặt hàng Online');
      }

      if (order.Status !== 'PENDING_REVIEW') {
        throw new Error(
          `Đơn hàng ${order.OrderCode} không ở trạng thái chờ duyệt (Trạng thái hiện tại: ${order.Status})!`
        );
      }

      // Nhánh 1: TỪ CHỐI ĐƠN HÀNG (REJECT) -> Giải phóng giữ kho 1 lần, không tạo hóa đơn
      if (action === 'REJECT') {
        if (!effectiveReason || effectiveReason.length < 5) {
          throw new Error('Vui lòng nhập lý do từ chối đơn hàng (tối thiểu 5 ký tự) để thông báo cho khách!');
        }

        for (const resv of order.reservations) {
          await packagingService.releaseReservationOnce(resv.ReservationID, 'RELEASED', tx, {
            userId: actorUserId,
            userName: actorName,
          });
        }

        return tx.onlineOrder.update({
          where: { OrderID: order.OrderID },
          data: {
            Status: 'REJECTED',
            PaymentStatus: 'VOID',
            ClinicalSafetyStatus: 'REJECTED',
            RejectCancelReason: effectiveReason,
            ReviewedByUserID: actorUserId,
            ReviewedByName: actorName,
            ReviewedAt: new Date(),
          },
          include: {
            items: { include: { product: true } },
            reservations: true,
            invoice: true,
          },
        });
      }

      // Nhánh 2: DƯỢC SĨ CHẤP THUẬN ĐƠN HÀNG (APPROVE)
      const clinicalAssessment = await evaluateClinicalSafetyServerSide(
        {
          productIds: order.items.map((i) => i.ProductID),
          customerId: order.CustomerID,
        },
        tx
      );

      if (
        clinicalAssessment.hasWarning &&
        (!clinicalReviewNote || clinicalReviewNote.trim().length < 5)
      ) {
        const err: any = new Error(
          'Đơn hàng có cảnh báo Dị ứng / Tương tác thuốc / Thuốc kê đơn (Rx)! Dược sĩ bắt buộc phải nhập Ghi chú thẩm định lâm sàng (clinicalReviewNote) trước khi duyệt xuất kho.'
        );
        err.statusCode = 422;
        err.code = 'CLINICAL_REVIEW_REQUIRED';
        throw err;
      }

      // Kiểm tra hạn mức công nợ B2B nếu đơn chọn phương thức CREDIT
      if (order.PaymentMethod === 'CREDIT') {
        if (!order.CustomerID || !order.customer) {
          throw new Error('Đơn công nợ B2B phải gắn với hồ sơ Đại lý hợp lệ!');
        }
        const nextDebt = (order.customer.DebtBalance || 0) + order.TotalAmount;
        const limit = order.customer.CreditLimit || 50000000;
        if (nextDebt > limit) {
          throw new Error(
            `Vượt hạn mức công nợ đại lý B2B (${nextDebt.toLocaleString('vi-VN')} > ${limit.toLocaleString('vi-VN')} đ)!`
          );
        }
        await tx.customer.update({
          where: { CustomerID: order.CustomerID },
          data: {
            DebtBalance: nextDebt,
          },
        });
      }

      // Chuyển từng InventoryReservation sang xuất kho thực tế & phân bổ Lô FEFO
      const invoiceItemsData: Array<{
        ProductID: number;
        Quantity: number;
        Unit: string;
        UnitPrice: number;
        BaseQuantityDeducted: number;
        LooseUnitsDeducted: number;
        BatchNumber: string;
        ExpiryDate: string;
        LotID: number | null;
        DosageNote: string;
      }> = [];

      for (const item of order.items) {
        const resv = order.reservations.find((r) => r.OrderItemID === item.OrderItemID);
        if (!resv) {
          throw new Error(`Không tìm thấy bản ghi giữ kho cho sản phẩm #${item.ProductID}`);
        }

        const consumed = await packagingService.consumeReservationAtomically(
          resv.ReservationID,
          tx,
          { userId: actorUserId, userName: actorName }
        );

        await tx.onlineOrderItem.update({
          where: { OrderItemID: item.OrderItemID },
          data: {
            BatchNumber: consumed.batchNumber,
            ExpiryDate: consumed.expiryDate,
          },
        });

        invoiceItemsData.push({
          ProductID: item.ProductID,
          Quantity: item.Quantity,
          Unit: item.Unit,
          UnitPrice: item.UnitPrice,
          BaseQuantityDeducted: consumed.baseQuantityDeducted,
          LooseUnitsDeducted: consumed.looseUnitsDeducted,
          BatchNumber: consumed.batchNumber,
          ExpiryDate: consumed.expiryDate,
          LotID: consumed.lotId,
          DosageNote: item.DosageNote || 'Theo hướng dẫn của Dược sĩ',
        });
      }

      // Phát hành Hóa đơn chính thức (Invoice) sau khi Dược sĩ duyệt
      const invoiceCode = `ONL-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const txCode = `${order.PaymentMethod}-${String(Date.now()).slice(-6)}`;

      const createdInvoice = await tx.invoice.create({
        data: {
          InvoiceCode: invoiceCode,
          OrderType: order.OrderType,
          Channel: 'ONLINE',
          FulfillmentStatus: 'CONFIRMED',
          PaymentStatus: 'UNPAID',
          CustomerName: order.CustomerName,
          CustomerPhone: order.CustomerPhone,
          ...(order.CustomerID ? { CustomerID: order.CustomerID } : {}),
          ...(actorUserId ? { UserID: actorUserId } : {}),
          CreatedByName: order.CustomerName,
          ApprovedByUserID: actorUserId,
          ApprovedByName: actorName,
          ApprovedAt: new Date(),
          ClinicalOverrideNote: clinicalReviewNote || 'Đạt kiểm duyệt Dược lâm sàng GPP',
          ShippingAddress: order.ShippingAddress,
          ShippingMethod: order.ShippingMethod,
          ShippingFee: order.ShippingFee,
          VatAmount: order.VatAmount,
          PaidAmount: 0,
          DebtAmount: order.TotalAmount,
          Discount: order.Discount,
          TotalAmount: order.TotalAmount,
          Note: order.Note,
          Status: 'COMPLETED',
          items: {
            create: invoiceItemsData,
          },
          payment: {
            create: {
              PaymentMethod: order.PaymentMethod,
              TransactionCode: txCode,
              PaidAmount: 0,
              Status: 'UNPAID',
            },
          },
        },
        include: {
          items: true,
        },
      });

      // Ghi StockMovement(EXPORT) cho từng dòng hóa đơn vừa phát hành
      for (const invItem of createdInvoice.items) {
        await tx.stockMovement.create({
          data: {
            ProductID: invItem.ProductID,
            SourceType: 'INVOICE',
            SourceID: createdInvoice.InvoiceID,
            LineItemID: invItem.ItemID,
            MovementType: 'EXPORT',
            Unit: invItem.Unit || 'Hộp',
            Quantity: invItem.Quantity,
            BaseQtyDelta: -(invItem.BaseQuantityDeducted ?? 0),
            LooseQtyDelta: -(invItem.LooseUnitsDeducted ?? 0),
            BatchNumber: invItem.BatchNumber,
            ExpiryDate: invItem.ExpiryDate,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Chuyển giữ kho đơn ${order.OrderCode} thành xuất bán hóa đơn ${createdInvoice.InvoiceCode}`,
          },
        });
      }

      return tx.onlineOrder.update({
        where: { OrderID: order.OrderID },
        data: {
          Status: 'CONFIRMED',
          ClinicalSafetyStatus: clinicalAssessment.hasWarning
            ? 'APPROVED_WITH_OVERRIDE'
            : 'SAFE',
          ClinicalReviewNote:
            clinicalReviewNote?.trim() || 'Đã kiểm tra an toàn thuốc & duyệt cấp phát',
          ReviewedByUserID: actorUserId,
          ReviewedByName: actorName,
          ReviewedAt: new Date(),
          InvoiceID: createdInvoice.InvoiceID,
        },
        include: {
          items: { include: { product: true } },
          reservations: true,
          invoice: {
            include: {
              payment: true,
              paymentTransactions: true,
            },
          },
        },
      });
    });

    const responseBody = {
      success: true,
      message:
        action === 'APPROVE'
          ? `Đã duyệt đơn ${reviewedOrder.OrderCode}, chuyển giữ kho thành xuất bán FEFO và phát hành hóa đơn ${reviewedOrder.invoice?.InvoiceCode}!`
          : `Đã từ chối đơn ${reviewedOrder.OrderCode} và giải phóng hoàn toàn lượng thuốc giữ tạm!`,
      data: reviewedOrder,
    };

    await saveIdempotency(
      idemCheck.compositeKey,
      `REVIEW_ORDER:${orderId}`,
      actorKey,
      idemCheck.payloadHash,
      200,
      responseBody
    );

    res.json(responseBody);
  } catch (error: any) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    res.status(error?.statusCode || 400).json({
      success: false,
      code: error?.code || 'REVIEW_ORDER_ERROR',
      message: error instanceof Error ? error.message : 'Lỗi khi duyệt đơn đặt hàng Online',
    });
  }
};

/**
 * 6. STAFF API: CẬP NHẬT TIẾN TRÌNH ĐÓNG GÓI & GIAO VẬN ĐƠN ONLINE THEO STATE MACHINE
 * PATCH /api/online-orders/:id/status
 * State machine: CONFIRMED -> PACKING -> SHIPPING -> DELIVERED (hoặc CANCELLED kèm lý do)
 * Lưu ý (Issue 6): Chuyển sang DELIVERED chỉ xác nhận giao hàng vật lý, KHÔNG tự động ghi đã thu tiền COD hay xóa nợ B2B!
 */
const ONLINE_ORDER_TRANSITIONS: Record<string, string[]> = {
  CONFIRMED: ['PACKING', 'SHIPPING', 'CANCELLED'],
  PACKING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const updateOnlineOrderStage = async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = Number(req.params.id);
    const { nextStatus: rawNextStatus, stage, courierTrackingCode, cancelReason } = req.body as {
      nextStatus?: 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
      stage?: 'PACKING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
      courierTrackingCode?: string;
      cancelReason?: string;
    };
    const nextStatus = rawNextStatus || stage;
    if (!nextStatus) {
      res.status(400).json({ success: false, message: 'Thiếu trạng thái vận đơn cần chuyển' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.onlineOrder.findUnique({
        where: { OrderID: orderId },
        include: {
          items: { include: { product: true } },
          invoice: { include: { items: { include: { product: true } }, customer: true } },
        },
      });

      if (!order) {
        throw new Error('Không tìm thấy đơn hàng Online');
      }

      const allowed = ONLINE_ORDER_TRANSITIONS[order.Status] || [];
      if (!allowed.includes(nextStatus)) {
        throw new Error(
          `Không thể chuyển trạng thái đơn ${order.OrderCode} từ "${order.Status}" sang "${nextStatus}". Các bước hợp lệ: [${allowed.join(', ') || 'Đã kết thúc'}]`
        );
      }

      if (nextStatus === 'CANCELLED') {
        if (!cancelReason || cancelReason.trim().length < 5) {
          throw new Error('Vui lòng nhập lý do hủy đơn hàng sau xác nhận!');
        }

        // Hoàn lại kho cho Hóa đơn liên kết nếu hủy sau khi đã CONFIRMED
        if (order.invoice && order.invoice.Status !== 'REFUNDED') {
          for (const invItem of order.invoice.items) {
            if (!invItem.product) continue;
            await packagingService.restoreStockOnRefund(
              invItem.product,
              invItem.BaseQuantityDeducted ?? 0,
              invItem.LooseUnitsDeducted ?? 0,
              tx,
              { lotId: invItem.LotID, batchNumber: invItem.BatchNumber }
            );
            await tx.stockMovement.create({
              data: {
                ProductID: invItem.ProductID,
                SourceType: 'INVOICE',
                SourceID: order.invoice.InvoiceID,
                LineItemID: invItem.ItemID,
                MovementType: 'RETURN',
                Unit: invItem.Unit || invItem.product.Unit,
                Quantity: invItem.Quantity,
                BaseQtyDelta: invItem.BaseQuantityDeducted ?? 0,
                LooseQtyDelta: invItem.LooseUnitsDeducted ?? 0,
                BatchNumber: invItem.BatchNumber,
                ExpiryDate: invItem.ExpiryDate,
                ActorUserID: req.user?.UserID || null,
                ActorName: req.user?.FullName || 'Nhân viên Điều phối',
                Note: `Hoàn kho do hủy đơn Online ${order.OrderCode}: ${cancelReason}`,
              },
            });
          }

          if (
            order.PaymentMethod === 'CREDIT' &&
            order.invoice.CustomerID &&
            order.invoice.customer
          ) {
            await tx.customer.update({
              where: { CustomerID: order.invoice.CustomerID },
              data: {
                DebtBalance: Math.max(
                  0,
                  (order.invoice.customer.DebtBalance || 0) - (order.invoice.DebtAmount || 0)
                ),
              },
            });
          }

          await tx.invoice.update({
            where: { InvoiceID: order.invoice.InvoiceID },
            data: {
              Status: 'REFUNDED',
              FulfillmentStatus: 'CANCELLED',
              PaymentStatus: 'VOID',
              DebtAmount: 0,
              CancelReason: cancelReason.trim(),
            },
          });
        }
      } else if (order.InvoiceID) {
        await tx.invoice.update({
          where: { InvoiceID: order.InvoiceID },
          data: {
            FulfillmentStatus: nextStatus,
          },
        });
      }

      const conditional = await tx.onlineOrder.updateMany({
        where: {
          OrderID: orderId,
          Status: order.Status,
        },
        data: {
          Status: nextStatus,
          ...(courierTrackingCode ? { CourierTrackingCode: courierTrackingCode.trim() } : {}),
          ...(cancelReason ? { RejectCancelReason: cancelReason.trim() } : {}),
          ...(nextStatus === 'CANCELLED' ? { PaymentStatus: 'VOID' } : {}),
        },
      });

      if (conditional.count !== 1) {
        throw new Error('Trạng thái đơn hàng vừa được cập nhật bởi nhân viên khác!');
      }

      return tx.onlineOrder.findUniqueOrThrow({
        where: { OrderID: orderId },
        include: {
          items: { include: { product: true } },
          reservations: true,
          invoice: {
            include: {
              payment: true,
              paymentTransactions: true,
            },
          },
        },
      });
    });

    res.json({
      success: true,
      message: `Đã cập nhật trạng thái vận đơn ${updated.OrderCode} sang ${nextStatus} (Trạng thái tiền: ${updated.PaymentStatus})`,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể cập nhật trạng thái đơn Online',
    });
  }
};
