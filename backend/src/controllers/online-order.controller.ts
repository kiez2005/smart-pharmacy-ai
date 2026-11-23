import crypto from 'crypto';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { PHARMACY_STORE_PROFILE } from '../config/pharmacy-profile';
import {
  deriveIsRxClassification,
  packagingService,
} from '../services/packaging.service';
import {
  IdempotencyConflictError,
  runWithIdempotencyTx,
} from '../services/idempotency.service';
import {
  canRoleOverrideClinicalSafety,
  evaluateClinicalSafetyServerSide,
  isValidOverrideReasonCode,
  mergePatientAllergies,
  recordClinicalAuditLogTx,
} from '../services/clinical-safety.service';
import {
  handlePrescriptionDownloadHttp,
  handlePrescriptionUploadHttp,
  resolveSafePrescriptionFilePath,
  validatePrescriptionForProducts,
} from '../services/prescription-storage.service';
import { TRACKING_TOKEN_TTL_DAYS } from '../config/env';
import { AiServiceError, aiGatewayService } from '../services/ai.service';
import { calculateServerShippingFee } from './invoice.controller';
import { mapToPublicCatalogItem } from '../utils/public-catalog.dto';

export function hashTrackingToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

function timingSafeTokenMatch(rawToken: string, storedHash?: string | null): boolean {
  if (!rawToken || !storedHash) return false;
  const candidate = hashTrackingToken(rawToken);
  const bufA = Buffer.from(candidate, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 0a. UPLOAD ẢNH ĐƠN THUỐC RIÊNG TƯ (POST /api/online-orders/prescriptions) - A5
 */
export const uploadPrescriptionImage = handlePrescriptionUploadHttp;

/**
 * 0b. DƯỢC SĨ / ADMIN TẢI ẢNH ĐƠN THUỐC PRIVATE (GET /api/online-orders/prescriptions/:fileKey) - A5
 */
export const downloadPrescriptionImage = handlePrescriptionDownloadHttp;

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
    .enum(['EXPRESS_2H', 'STANDARD', 'PICKUP', 'GDP_TRUCK'])
    .optional()
    .default('EXPRESS_2H'),
  PaymentMethod: z.enum(['COD', 'VIETQR', 'CREDIT']).optional().default('COD'),
  IncludeVat: z.boolean().optional().default(false),
  PatientAllergies: z.string().trim().max(500).optional().default(''),
  PrescriptionFileKey: z.string().trim().optional(),
  PrescriptionImage: z.string().trim().optional(),
  Note: z.string().trim().max(1000).optional().default(''),
  idempotencyKey: z.string().trim().optional(),
  items: z.array(onlineOrderItemSchema).min(1, 'Giỏ đặt hàng phải có ít nhất 1 sản phẩm'),
});

/**
 * 1. PUBLIC API CHO KHÁCH HÀNG ĐẶT ĐƠN ONLINE + GIỮ KHO NGUYÊN TỬ CÓ THỜI HẠN (POST /api/online-orders)
 * - Chặn gán CustomerID nội bộ, WHOLESALE hoặc CREDIT qua endpoint công khai (A1).
 * - Khóa idempotency atomically bên trong Prisma transaction (A2).
 * - Lưu dị ứng khai báo vào cột có cấu trúc `PatientAllergies` + ảnh toa thuốc qua multipart file key private (S2/A5).
 * - Sinh mã OrderCode entropy cao + hash TrackingToken (chỉ trả token thô 1 lần lúc tạo đơn - A5).
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
        code: 'INVALID_ONLINE_ORDER',
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
      PrescriptionFileKey,
      PrescriptionImage,
      Note,
      items,
    } = parsed.data;

    // A1 FIX: Cấm tuyệt đối giả mạo CustomerID nội bộ, đơn bán buôn WHOLESALE hoặc ghi nợ CREDIT qua cổng public
    if (CustomerID !== undefined && CustomerID !== null) {
      res.status(403).json({
        success: false,
        code: 'PUBLIC_CUSTOMER_ID_FORBIDDEN',
        message: 'Không được phép truyền CustomerID nội bộ qua cổng đặt hàng công khai.',
      });
      return;
    }
    if (OrderType === 'WHOLESALE' || PaymentMethod === 'CREDIT' || ShippingMethod === 'GDP_TRUCK') {
      res.status(403).json({
        success: false,
        code: 'PUBLIC_WHOLESALE_CREDIT_FORBIDDEN',
        message:
          'Đơn giá sỉ B2B hoặc ghi công nợ CREDIT yêu cầu đại lý xác thực qua quầy / hệ thống ERP nội bộ.',
      });
      return;
    }

    const rxValidation = await validatePrescriptionForProducts({
      productIds: items.map((i) => i.ProductID),
      prescriptionFileKey: PrescriptionFileKey,
      inlineImage: PrescriptionImage,
      note: Note,
    });
    if (!rxValidation.ok) {
      res.status(rxValidation.status).json({
        success: false,
        code: rxValidation.code,
        message: rxValidation.message,
      });
      return;
    }
    const validatedFileKey = rxValidation.fileKey;
    const validatedFileMime = rxValidation.fileMime;

    const structuredAllergies = mergePatientAllergies(PatientAllergies);
    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || parsed.data.idempotencyKey;
    const actorKey = `guest:${CustomerPhone}`;

    const reservationTtlMinutes = Math.max(
      1,
      Number(process.env.RESERVATION_TTL_MINUTES || 15)
    );

    const idemResult = await runWithIdempotencyTx(
      {
        rawKey: rawIdemKey,
        scope: 'CREATE_ONLINE_ORDER',
        actorKey,
        payload: parsed.data,
      },
      async (tx) => {
        // Giải phóng các reservation đã quá hạn trước khi kiểm tra tồn khả dụng
        await packagingService.releaseExpiredReservations(tx);

        // Đánh giá an toàn dược lâm sàng (S2) dựa trên danh sách thuốc + dị ứng khách hàng khai báo
        const clinicalSafety = await evaluateClinicalSafetyServerSide({
          tx,
          customerId: null,
          patientAllergiesOverride: structuredAllergies,
          productIds: items.map((i) => i.ProductID),
        });

        let subTotal = 0;
        const reservedLines: Array<{
          ProductID: number;
          Quantity: number;
          Unit: string;
          UnitPrice: number;
          BaseQtyReserved: number;
          LooseQtyReserved: number;
          DosageNote: string;
        }> = [];

        // Giữ kho nguyên tử cho toàn bộ các dòng hàng (cưỡng chế đơn RETAIL, không bao giờ tự bật giá sỉ public)
        for (const item of items) {
          const resvCalc = await packagingService.reserveStockAtomically(
            item.ProductID,
            item.Unit,
            item.Quantity,
            tx,
            {
              orderType: 'RETAIL',
              isVerifiedWholesaleCustomer: false,
            }
          );

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

        const vatAmount = IncludeVat ? Math.round(subTotal * 0.05) : 0;
        const shippingFee = calculateServerShippingFee({
          channel: 'ONLINE',
          orderType: 'RETAIL',
          shippingMethod: ShippingMethod,
          netMerchandiseAmount: subTotal,
        });
        const totalAmount = subTotal + vatAmount + shippingFee;

        // A5: Entropy cao cho OrderCode & TrackingToken (chỉ lưu hash trong DB, cấp TTL hết hạn)
        const orderCode = `WEB-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        const rawTrackingToken = `TRK-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
        const trackingTokenHash = hashTrackingToken(rawTrackingToken);
        const trackingExpiresAt = new Date(
          Date.now() + TRACKING_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
        );
        const reservedUntil = new Date(Date.now() + reservationTtlMinutes * 60 * 1000);
        const initialClinicalStatus = clinicalSafety.requiresPharmacistReview
          ? 'WARNING_REQUIRES_REVIEW'
          : 'SAFE';

        const order = await tx.onlineOrder.create({
          data: {
            OrderCode: orderCode,
            TrackingToken: null,
            TrackingTokenHash: trackingTokenHash,
            TrackingExpiresAt: trackingExpiresAt,
            OrderType: 'RETAIL',
            Status: 'PENDING_REVIEW',
            PaymentStatus: 'UNPAID',
            PaymentMethod,
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
            PatientAllergies: structuredAllergies || null,
            PrescriptionFileKey: validatedFileKey,
            PrescriptionFileMime: validatedFileMime,
            Note: Note.trim(),
            ReservedUntil: reservedUntil,
            ClinicalSafetyStatus: initialClinicalStatus,
            ClinicalWarningsJson: JSON.stringify(clinicalSafety.warnings),
            items: {
              create: reservedLines,
            },
          },
          include: {
            items: { include: { product: true } },
          },
        });

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

        const fullOrder = await tx.onlineOrder.findUniqueOrThrow({
          where: { OrderID: order.OrderID },
          include: {
            items: { include: { product: true } },
            reservations: true,
          },
        });

        // Không trả TrackingTokenHash ra ngoài; trả rawTrackingToken 1 lần duy nhất cho khách tra cứu
        const { TrackingTokenHash: _omittedHash, TrackingToken: _omittedPlain, ...safeOrderView } =
          fullOrder;

        return {
          statusCode: 201,
          body: {
            success: true,
            message: `Đã tiếp nhận đơn đặt hàng ${order.OrderCode} và giữ thuốc tạm thời đến ${reservedUntil.toLocaleTimeString('vi-VN')} chờ Dược sĩ duyệt!`,
            data: {
              ...safeOrderView,
              TrackingToken: rawTrackingToken,
              clinicalSafety: {
                isAdvisoryOnly: clinicalSafety.isAdvisoryOnly,
                disclaimer: clinicalSafety.disclaimer,
                requiresPharmacistReview: clinicalSafety.requiresPharmacistReview,
                warnings: clinicalSafety.warnings,
              },
            },
          },
        };
      }
    );

    res.status(idemResult.statusCode).json(idemResult.body);
  } catch (error: any) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, code: 'IDEMPOTENCY_CONFLICT', message: error.message });
      return;
    }
    const isOutOfStock = error?.code === 'OUT_OF_STOCK';
    const status = error?.statusCode && error.statusCode < 500 ? error.statusCode : 400;
    res.status(status).json({
      success: false,
      code: error?.code || 'ONLINE_ORDER_ERROR',
      waitlistAvailable: isOutOfStock,
      message:
        status >= 400 && status < 500 && error instanceof Error
          ? error.message
          : 'Không thể tạo đơn đặt hàng trực tuyến. Vui lòng kiểm tra lại giỏ hàng.',
    });
  }
};

/**
 * 2. PUBLIC API TRA CỨU ĐƠN HÀNG DÀNH RIÊNG CHO KHÁCH HÀNG (GET /api/online-orders/track)
 * Giải quyết Issue 1 & Issue 8:
 * - Khách chỉ xem được đúng đơn của mình khi cung cấp khớp OrderCode + (CustomerPhone hoặc TrackingToken).
 * - Tuyệt đối không lộ danh sách đơn của khách hàng khác!
 */
function maskPhone(phone: string): string {
  const clean = phone.trim();
  if (clean.length <= 4) return '****';
  return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}

/**
 * 2. PUBLIC API TRA CỨU ĐƠN HÀNG DÀNH RIÊNG CHO KHÁCH HÀNG (GET /api/online-orders/track) - A5
 * - Bắt buộc khớp OrderCode + TrackingToken còn hiệu lực TTL (xác thực qua SHA-256 timingSafeEqual).
 * - Không trả Token hash, không lộ PII nhạy cảm.
 */
export const trackCustomerOnlineOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations().catch(() => 0);

    const orderCode = String(req.query.orderCode || '').trim().toUpperCase();
    const headerToken = String(req.headers['x-tracking-token'] || '').trim().toUpperCase();
    const queryToken = String(req.query.trackingToken || '').trim().toUpperCase();

    // P1-08: Cấm truyền TrackingToken trên URL query string để không lộ token trong access log / browser history
    if (queryToken && !headerToken) {
      res.status(400).json({
        success: false,
        code: 'QUERY_TOKEN_FORBIDDEN',
        message:
          'Vì lý do bảo mật, không được truyền Mã tra cứu (TrackingToken) trên URL query string! Vui lòng gửi qua header X-Tracking-Token.',
      });
      return;
    }

    const trackingToken = headerToken;

    if (!orderCode || !trackingToken) {
      res.status(400).json({
        success: false,
        code: 'MISSING_TRACKING_CREDENTIALS',
        message: 'Vui lòng cung cấp đủ Mã đơn hàng (WEB-...) và header X-Tracking-Token (TRK-...).',
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
        invoice: {
          select: {
            InvoiceCode: true,
            FulfillmentStatus: true,
            PaymentStatus: true,
            TotalAmount: true,
            PaidAmount: true,
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({
        success: false,
        code: 'ORDER_NOT_FOUND',
        message: 'Không tìm thấy đơn hàng hoặc thông tin xác thực không khớp.',
      });
      return;
    }

    const isExpired = Boolean(
      order.TrackingExpiresAt && order.TrackingExpiresAt.getTime() <= Date.now()
    );
    const hasValidToken =
      !isExpired && timingSafeTokenMatch(trackingToken, order.TrackingTokenHash);

    if (!hasValidToken) {
      res.status(403).json({
        success: false,
        code: isExpired ? 'TRACKING_TOKEN_EXPIRED' : 'INVALID_TRACKING_TOKEN',
        message: isExpired
          ? 'Mã tra cứu đơn hàng đã hết thời hạn hiệu lực. Vui lòng liên hệ Dược sĩ nhà thuốc.'
          : 'Mã tra cứu bảo mật không khớp với đơn hàng này!',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        OrderID: order.OrderID,
        OrderCode: order.OrderCode,
        OrderType: order.OrderType,
        Status: order.Status,
        PaymentStatus: order.PaymentStatus,
        PaymentMethod: order.PaymentMethod,
        CustomerName: order.CustomerName,
        CustomerPhoneMasked: maskPhone(order.CustomerPhone),
        ShippingMethod: order.ShippingMethod,
        SubTotal: order.SubTotal,
        ShippingFee: order.ShippingFee,
        VatAmount: order.VatAmount,
        Discount: order.Discount,
        TotalAmount: order.TotalAmount,
        PaidAmount: order.PaidAmount,
        PatientAllergies: order.PatientAllergies,
        HasPrescriptionFile: Boolean(order.PrescriptionFileKey),
        ReservedUntil: order.ReservedUntil,
        ClinicalSafetyStatus: order.ClinicalSafetyStatus,
        RejectCancelReason: order.RejectCancelReason,
        CourierTrackingCode: order.CourierTrackingCode,
        CreateDate: order.CreateDate,
        UpdateDate: order.UpdateDate,
        items: order.items.map((item) => ({
          OrderItemID: item.OrderItemID,
          ProductID: item.ProductID,
          Quantity: item.Quantity,
          Unit: item.Unit,
          UnitPrice: item.UnitPrice,
          DosageNote: item.DosageNote,
          product: item.product,
        })),
        invoice: order.invoice,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      code: 'TRACKING_ERROR',
      message: 'Lỗi khi tra cứu tiến độ đơn hàng.',
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
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).json({ success: false, code: 'INVALID_ORDER_ID', message: 'Mã đơn không hợp lệ' });
      return;
    }

    const { trackingToken, phoneOrToken, reason } = req.body as {
      trackingToken?: string;
      phoneOrToken?: string;
      reason?: string;
    };
    const headerToken = String(req.headers['x-tracking-token'] || '').trim().toUpperCase();
    const rawToken =
      headerToken ||
      String(trackingToken || '').trim().toUpperCase() ||
      (String(phoneOrToken || '').trim().toUpperCase().startsWith('TRK-')
        ? String(phoneOrToken || '').trim().toUpperCase()
        : '');

    if (!rawToken) {
      res.status(403).json({
        success: false,
        code: 'MISSING_TRACKING_TOKEN',
        message: 'Bắt buộc cung cấp Mã tra cứu bảo mật (TrackingToken) hợp lệ để hủy đơn!',
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.onlineOrder.findUnique({
        where: { OrderID: orderId },
        include: { reservations: true },
      });

      if (!order) {
        const err: any = new Error('Không tìm thấy đơn hàng');
        err.statusCode = 404;
        throw err;
      }

      const isExpired = Boolean(
        order.TrackingExpiresAt && order.TrackingExpiresAt.getTime() <= Date.now()
      );
      const tokenMatches =
        !isExpired && timingSafeTokenMatch(rawToken, order.TrackingTokenHash);

      if (!tokenMatches) {
        const err: any = new Error('Mã tra cứu không khớp hoặc đã hết hạn, không thể hủy đơn!');
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
        select: {
          OrderID: true,
          OrderCode: true,
          Status: true,
          PaymentStatus: true,
          RejectCancelReason: true,
          UpdateDate: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã hủy đơn ${updated.OrderCode} và giải phóng giữ kho thành công`,
      data: updated,
    });
  } catch (error: any) {
    const status = error?.statusCode && error.statusCode < 500 ? error.statusCode : 400;
    res.status(status).json({
      success: false,
      code: error?.code || 'CUSTOMER_CANCEL_ERROR',
      message: status < 500 && error instanceof Error ? error.message : 'Không thể hủy đơn hàng',
    });
  }
};

/**
 * 0. PUBLIC STOREFRONT CATALOG API (GET /api/online-orders/catalog) - A6 + U4 + P1
 * - Chỉ trả danh mục ĐÃ XUẤT BẢN (IsPublished: true, IsTestOnly: false).
 * - DTO Allowlist nghiêm ngặt: KHÔNG lộ tồn kho thực tế chính xác, giá sỉ B2B, stockLots, LooseUnits, ReservedBaseQty, Version.
 * - Hỗ trợ phân trang & lọc phía Server (`page`, `limit`, `search`, `type`, `inStockOnly`).
 */
const SYMPTOM_SQL_KEYWORDS: Record<string, string[]> = {
  FEVER_FLU: ['paracetamol', 'panadol', 'hạ sốt', 'cảm', 'sốt', 'giảm đau', 'efferalgan', 'decolgen', 'hapacol'],
  ANTIBIOTIC: ['amoxicillin', 'augmentin', 'azithromycin', 'kháng sinh', 'ho', 'hô hấp', 'prospan', 'acetylcystein'],
  STOMACH: ['omeprazol', 'dạ dày', 'men tiêu hóa', 'gaviscon', 'tiêu hóa', 'enterogermina', 'smecta', 'phosphalugel'],
  VITAMIN: ['vitamin', 'kẽm', 'zinc', 'sắt', 'omega', 'tăng đề kháng', 'canxi', 'berocca', 'enervon'],
};

export const getPublicStoreProfile = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.json({
    success: true,
    data: PHARMACY_STORE_PROFILE,
  });
};

export const getPublicStorefrontCatalog = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawSearch = String(req.query.search || '').trim();
    const searchLower = rawSearch.toLowerCase();
    const type = String(req.query.type || req.query.productType || '').trim();
    const rxFilter = String(req.query.rxFilter || 'ALL').trim().toUpperCase();
    const symptom = String(req.query.symptom || 'ALL_SYMPTOM').trim().toUpperCase();
    const inStockOnly = req.query.inStockOnly === 'true' || req.query.inStockOnly === '1';
    const page = Math.max(1, Number(req.query.page || 1) || 1);
    const limit = Math.min(48, Math.max(1, Number(req.query.limit || 24) || 24));
    const todayIso = new Date().toISOString().slice(0, 10);

    const escapeLike = (val: string) => val.replace(/[\\%_]/g, '\\$&');
    const conditions: Prisma.Sql[] = [
      Prisma.sql`pk.IsPublished = 1`,
      Prisma.sql`pk.IsTestOnly = 0`,
    ];

    if (type && type !== 'ALL') {
      conditions.push(Prisma.sql`p.ProductType = ${type}`);
    }

    if (rxFilter === 'OTC') {
      conditions.push(Prisma.sql`pk.IsRx = 0`);
    } else if (rxFilter === 'RX') {
      conditions.push(Prisma.sql`pk.IsRx = 1`);
    }

    const symptomKeywords = SYMPTOM_SQL_KEYWORDS[symptom];
    if (symptomKeywords && symptomKeywords.length > 0) {
      const symptomClauses = symptomKeywords.map((kw) => {
        const pat = `%${escapeLike(kw)}%`;
        return Prisma.sql`(
          LOWER(p.ProductName) LIKE ${pat} ESCAPE '\\'
          OR LOWER(p.Description) LIKE ${pat} ESCAPE '\\'
          OR LOWER(p.ProductType) LIKE ${pat} ESCAPE '\\'
          OR p.ProductName LIKE ${pat} ESCAPE '\\'
          OR p.Description LIKE ${pat} ESCAPE '\\'
          OR p.ProductType LIKE ${pat} ESCAPE '\\'
        )`;
      });
      conditions.push(Prisma.sql`(${Prisma.join(symptomClauses, ' OR ')})`);
    }

    if (inStockOnly) {
      conditions.push(Prisma.sql`(p.Quantity - COALESCE(pk.ReservedBaseQty, 0)) > 0`);
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1 FROM StockLot sl
          WHERE sl.ProductID = p.ProductID
            AND sl.Status = 'ACTIVE'
            AND sl.RemainingQuantity > 0
            AND sl.ExpiryDate >= ${todayIso}
        )`
      );
    }

    let searchMeta: {
      engine: 'hybrid-rrf' | 'bm25-keyword-only' | 'keyword-degraded' | 'sql-catalog';
      semanticAvailable: boolean;
      semanticDegraded: boolean;
      warning?: string;
    } = {
      engine: 'sql-catalog',
      semanticAvailable: true,
      semanticDegraded: false,
    };

    let hybridOrderMap: Map<number, number> | null = null;

    if (rawSearch) {
      const hybridHit = await aiGatewayService.searchHybrid(rawSearch, {
        limit: 60,
        onlyStorefrontPublished: true,
        includeTest: false,
      });

      const lowerPat = `%${escapeLike(searchLower)}%`;
      const rawPat = `%${escapeLike(rawSearch)}%`;
      const likeCondition = Prisma.sql`(
        LOWER(p.ProductName) LIKE ${lowerPat} ESCAPE '\\'
        OR LOWER(p.Description) LIKE ${lowerPat} ESCAPE '\\'
        OR LOWER(p.ProductType) LIKE ${lowerPat} ESCAPE '\\'
        OR p.ProductName LIKE ${rawPat} ESCAPE '\\'
        OR p.Description LIKE ${rawPat} ESCAPE '\\'
        OR p.ProductType LIKE ${rawPat} ESCAPE '\\'
      )`;

      if (hybridHit.available) {
        const hybridIds = hybridHit.results.map((r) => r.ProductID);
        hybridOrderMap = new Map(hybridIds.map((id, idx) => [id, idx]));
        searchMeta = {
          engine: hybridHit.semanticAvailable ? 'hybrid-rrf' : 'bm25-keyword-only',
          semanticAvailable: hybridHit.semanticAvailable,
          semanticDegraded: !hybridHit.semanticAvailable,
          ...(hybridHit.semanticAvailable
            ? {}
            : { warning: 'Tìm kiếm ngữ nghĩa tạm gián đoạn — đang dùng BM25 từ khóa.' }),
        };

        if (hybridIds.length > 0) {
          conditions.push(
            Prisma.sql`(p.ProductID IN (${Prisma.join(hybridIds)}) OR ${likeCondition})`
          );
        } else {
          conditions.push(likeCondition);
        }
      } else {
        conditions.push(likeCondition);
        searchMeta = {
          engine: 'keyword-degraded',
          semanticAvailable: false,
          semanticDegraded: true,
          warning: 'Tìm kiếm ngữ nghĩa tạm gián đoạn — đang hiển thị kết quả khớp từ khóa.',
        };
      }
    }

    const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    let total = 0;
    let totalPages = 1;
    let safePage = 1;
    let pageProductIds: number[] = [];

    if (hybridOrderMap) {
      const matchedIdRows = await prisma.$queryRaw<Array<{ ProductID: number }>>(
        Prisma.sql`
          SELECT p.ProductID
          FROM Product p
          INNER JOIN ProductPackaging pk ON pk.ProductID = p.ProductID
          ${whereSql}
          ORDER BY p.ProductID ASC
        `
      );
      const sortedIds = matchedIdRows
        .map((r) => Number(r.ProductID))
        .sort((a, b) => {
          const rankA = hybridOrderMap!.get(a) ?? 999999;
          const rankB = hybridOrderMap!.get(b) ?? 999999;
          if (rankA !== rankB) return rankA - rankB;
          return a - b;
        });

      total = sortedIds.length;
      totalPages = Math.max(1, Math.ceil(total / limit));
      safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * limit;
      pageProductIds = sortedIds.slice(offset, offset + limit);
    } else {
      const countRows = await prisma.$queryRaw<Array<{ total: bigint | number }>>(
        Prisma.sql`
          SELECT COUNT(*) AS total
          FROM Product p
          INNER JOIN ProductPackaging pk ON pk.ProductID = p.ProductID
          ${whereSql}
        `
      );

      total = Number(countRows[0]?.total ?? 0);
      totalPages = Math.max(1, Math.ceil(total / limit));
      safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * limit;

      const pageIdRows =
        total > 0
          ? await prisma.$queryRaw<Array<{ ProductID: number }>>(
              Prisma.sql`
                SELECT p.ProductID
                FROM Product p
                INNER JOIN ProductPackaging pk ON pk.ProductID = p.ProductID
                ${whereSql}
                ORDER BY p.ProductID ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            )
          : [];

      pageProductIds = pageIdRows.map((row) => Number(row.ProductID));
    }

    const [pageProducts, categoriesRows] = await Promise.all([
      pageProductIds.length > 0
        ? prisma.product.findMany({
            where: { ProductID: { in: pageProductIds } },
            include: {
              packaging: {
                select: {
                  PackageUnit: true,
                  BlisterUnit: true,
                  BlistersPerPackage: true,
                  SmallestUnit: true,
                  UnitsPerPackage: true,
                  UnitsPerBlister: true,
                  AllowFractionalSale: true,
                  ReservedBaseQty: true,
                  IsRx: true,
                },
              },
              stockLots: {
                where: {
                  Status: 'ACTIVE',
                  RemainingQuantity: { gt: 0 },
                  ExpiryDate: { gte: todayIso },
                },
                select: {
                  RemainingQuantity: true,
                },
              },
            },
            orderBy: { ProductID: 'asc' },
          })
        : Promise.resolve([]),
      prisma.product.findMany({
        where: {
          packaging: {
            is: {
              IsPublished: true,
              IsTestOnly: false,
            },
          },
        },
        select: { ProductType: true },
        distinct: ['ProductType'],
        orderBy: { ProductType: 'asc' },
      }),
    ]);

    const orderRankMap = new Map(pageProductIds.map((id, idx) => [id, idx]));
    const orderedPageProducts = [...pageProducts].sort(
      (a, b) => (orderRankMap.get(a.ProductID) ?? 9999) - (orderRankMap.get(b.ProductID) ?? 9999)
    );

    const pagedItems = orderedPageProducts.map(mapToPublicCatalogItem);

    res.json({
      success: true,
      data: {
        items: pagedItems,
        total,
        page: safePage,
        limit,
        totalPages,
        categories: categoriesRows.map((c) => c.ProductType),
        searchMeta,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      code: 'CATALOG_LOAD_ERROR',
      message: 'Không thể tải danh mục dược phẩm trực tuyến.',
    });
  }
};

/**
 * 4. STAFF API: DANH SÁCH HÀNG CHỜ ĐƠN ONLINE CHO DƯỢC SĨ & ĐIỀU PHỐI (GET /api/online-orders) - P1
 */
export const listOnlineOrdersForStaff = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const statusFilter = String(req.query.status || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
    const skip = (page - 1) * limit;
    const whereClause =
      statusFilter && statusFilter !== 'ALL' ? { Status: statusFilter } : {};

    const [total, orders] = await Promise.all([
      prisma.onlineOrder.count({ where: whereClause }),
      prisma.onlineOrder.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              product: {
                include: {
                  packaging: true,
                },
              },
              lotAllocations: true,
            },
          },
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
        skip,
        take: limit,
      }),
    ]);

    const isCashier = req.user?.Role === 'CASHIER';

    const formatted = orders.map((o) => {
      let clinicalWarnings: unknown[] = [];
      if (!isCashier && o.ClinicalWarningsJson) {
        try {
          clinicalWarnings = JSON.parse(o.ClinicalWarningsJson);
        } catch {
          clinicalWarnings = [];
        }
      }
      const { TrackingTokenHash: _h, TrackingToken: _t, ...safeOrder } = o;

      // P1-01: Thu ngân (CASHIER) chỉ xem thông tin đóng gói/giao nhận, không đọc tiền sử dị ứng/toa thuốc/cảnh báo lâm sàng
      if (isCashier) {
        return {
          ...safeOrder,
          PatientAllergies: undefined,
          PrescriptionFileKey: null,
          ClinicalWarningsJson: null,
          clinicalWarnings: [],
          customer: safeOrder.customer
            ? {
                ...safeOrder.customer,
                Allergies: undefined,
                ChronicCond: undefined,
              }
            : null,
        };
      }

      return {
        ...safeOrder,
        clinicalWarnings,
      };
    });

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
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
    const {
      action,
      reason,
      rejectReason,
      clinicalReviewNote,
      clinicalOverrideCode,
      idempotencyKey,
    } = req.body as {
      action: 'APPROVE' | 'REJECT';
      reason?: string;
      rejectReason?: string;
      clinicalReviewNote?: string;
      clinicalOverrideCode?: string;
      idempotencyKey?: string;
    };
    const effectiveReason = (reason || rejectReason || '').trim();

    if (!['APPROVE', 'REJECT'].includes(action)) {
      res.status(400).json({ success: false, message: 'Hành động duyệt phải là APPROVE hoặc REJECT' });
      return;
    }

    if (!canRoleOverrideClinicalSafety(req.user?.Role)) {
      res.status(403).json({
        success: false,
        code: 'CLINICAL_REVIEW_ROLE_REQUIRED',
        message: 'Chỉ Dược sĩ (PHARMACIST) hoặc Quản trị viên (ADMIN) mới có quyền thẩm định đơn Online.',
      });
      return;
    }

    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || idempotencyKey;
    const actorUserId = req.user?.UserID;
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Yêu cầu tài khoản Dược sĩ hợp lệ' });
      return;
    }
    const actorName = req.user?.FullName || 'Dược sĩ Phụ trách';
    const actorRole = req.user?.Role || 'PHARMACIST';
    const actorKey = `user:${actorUserId}`;

    const idemResult = await runWithIdempotencyTx(
      {
        rawKey: rawIdemKey,
        scope: `REVIEW_ORDER:${orderId}`,
        actorKey,
        payload: {
          orderId,
          action,
          reason: effectiveReason,
          clinicalReviewNote,
          clinicalOverrideCode,
        },
      },
      async (tx) => {
        await packagingService.releaseExpiredReservations(tx);

        const order = await tx.onlineOrder.findUnique({
          where: { OrderID: orderId },
          include: {
            items: { include: { product: { include: { packaging: true } } } },
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

        // Nhánh 1: TỪ CHỐI ĐƠN HÀNG (REJECT) -> Giải phóng giữ kho 1 lần, ghi nhật ký lâm sàng
        if (action === 'REJECT') {
          if (!effectiveReason || effectiveReason.length < 5) {
            throw new Error(
              'Vui lòng nhập lý do từ chối đơn hàng (tối thiểu 5 ký tự) để thông báo cho khách!'
            );
          }

          for (const resv of order.reservations) {
            await packagingService.releaseReservationOnce(resv.ReservationID, 'RELEASED', tx, {
              userId: actorUserId,
              userName: actorName,
            });
          }

          let parsedWarnings: unknown[] = [];
          if (order.ClinicalWarningsJson) {
            try {
              parsedWarnings = JSON.parse(order.ClinicalWarningsJson);
            } catch {
              parsedWarnings = [];
            }
          }

          await recordClinicalAuditLogTx(tx, {
            actorUserId,
            actorName,
            actorRole,
            contextType: 'ONLINE_ORDER_REVIEW',
            onlineOrderId: order.OrderID,
            customerId: order.CustomerID,
            patientAllergies: order.PatientAllergies,
            action: 'REJECT_RX',
            reasonCode: 'REJECTED_BY_PHARMACIST',
            reasonNote: effectiveReason,
            warnings: parsedWarnings,
          });

          const rejected = await tx.onlineOrder.update({
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

          const { TrackingTokenHash: _h, TrackingToken: _t, ...safeRejected } = rejected;
          return {
            statusCode: 200,
            body: {
              success: true,
              message: `Đã từ chối đơn ${safeRejected.OrderCode} và giải phóng hoàn toàn lượng thuốc giữ tạm!`,
              data: safeRejected,
            },
          };
        }

        // Nhánh 2: DƯỢC SĨ CHẤP THUẬN ĐƠN HÀNG (APPROVE)
        const hasRxProduct = order.items.some((item) =>
          item.product?.packaging
            ? Boolean(item.product.packaging.IsRx)
            : deriveIsRxClassification(item.product)
        );
        const hasValidPrescriptionFile = Boolean(
          order.PrescriptionFileKey &&
            resolveSafePrescriptionFilePath(order.PrescriptionFileKey)
        );
        if (hasRxProduct && !hasValidPrescriptionFile) {
          const err: any = new Error(
            'Đơn hàng chứa thuốc kê đơn (Rx) nhưng chưa có ảnh toa thuốc hợp lệ trên hệ thống. Không thể duyệt xuất kho!'
          );
          err.statusCode = 422;
          err.code = 'PRESCRIPTION_FILE_REQUIRED';
          throw err;
        }

        // S2 FIX: Luôn truyền cả CustomerID VÀ PatientAllergies khai báo trên OnlineOrder
        const clinicalAssessment = await evaluateClinicalSafetyServerSide({
          tx,
          customerId: order.CustomerID,
          patientAllergiesOverride: order.PatientAllergies,
          productIds: order.items.map((i) => i.ProductID),
        });

        const isCriticalOrHigh =
          clinicalAssessment.hasCriticalAllergy || clinicalAssessment.hasHighRiskWarning;

        if (isCriticalOrHigh) {
          if (
            !isValidOverrideReasonCode(clinicalOverrideCode) ||
            !clinicalReviewNote ||
            clinicalReviewNote.trim().length < 10
          ) {
            const err: any = new Error(
              clinicalAssessment.warnings[0]?.detail ||
                'Đơn hàng có cảnh báo Dị ứng / Tương tác thuốc mức CAO! Dược sĩ phải chọn mã lý do vượt cảnh báo (clinicalOverrideCode) và nhập ghi chú thẩm định >= 10 ký tự.'
            );
            err.statusCode = 422;
            err.code = 'CLINICAL_REVIEW_REQUIRED';
            throw err;
          }
        } else if (
          clinicalAssessment.requiresPharmacistReview &&
          (!clinicalReviewNote || clinicalReviewNote.trim().length < 5)
        ) {
          const err: any = new Error(
            'Đơn hàng có lưu ý tương tác thuốc! Dược sĩ cần nhập ghi chú tư vấn (clinicalReviewNote >= 5 ký tự) trước khi duyệt.'
          );
          err.statusCode = 422;
          err.code = 'CLINICAL_REVIEW_REQUIRED';
          throw err;
        }

        if (order.PaymentMethod === 'CREDIT') {
          if (!order.CustomerID || !order.customer || order.customer.CustomerType !== 'WHOLESALE') {
            const err: any = new Error(
              'Đơn công nợ B2B (CREDIT) bắt buộc phải gắn với hồ sơ Đại lý bán buôn (WHOLESALE) hợp lệ!'
            );
            err.statusCode = 400;
            err.code = 'RETAIL_CREDIT_FORBIDDEN';
            throw err;
          }
          const limit = order.customer.CreditLimit || 50000000;
          const maxAllowedDebt = limit - order.TotalAmount;
          const atomicUpdate = await tx.customer.updateMany({
            where: {
              CustomerID: order.CustomerID,
              CustomerType: 'WHOLESALE',
              DebtBalance: { lte: maxAllowedDebt },
            },
            data: {
              DebtBalance: { increment: order.TotalAmount },
            },
          });
          if (atomicUpdate.count === 0) {
            const nextDebt = (order.customer.DebtBalance || 0) + order.TotalAmount;
            const err: any = new Error(
              `Vượt hạn mức công nợ đại lý B2B (${nextDebt.toLocaleString('vi-VN')} > ${limit.toLocaleString('vi-VN')} đ)!`
            );
            err.statusCode = 422;
            err.code = 'CREDIT_LIMIT_EXCEEDED';
            throw err;
          }
        }

        const invoiceItemsData: Array<{
          ProductID: number;
          Quantity: number;
          Unit: string;
          UnitPrice: number;
          BaseQuantityDeducted: number;
          LooseUnitsDeducted: number;
          BatchNumber: string | null;
          ExpiryDate: string | null;
          LotID: number | null;
          DosageNote: string;
          allocations: Array<{
            lotId: number;
            batchNumber: string;
            expiryDate: string;
            quantity: number;
          }>;
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
              ...(consumed.allocations && consumed.allocations.length > 0
                ? {
                    lotAllocations: {
                      create: consumed.allocations.map((alloc) => ({
                        LotID: alloc.lotId,
                        BatchNumber: alloc.batchNumber,
                        ExpiryDate: alloc.expiryDate,
                        Quantity: alloc.quantity,
                      })),
                    },
                  }
                : {}),
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
            allocations: consumed.allocations || [],
          });
        }

        const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
        const invoiceCode = `ONL-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}${suffix}`;
        const txCode = `${order.PaymentMethod}-${String(Date.now()).slice(-6)}${suffix}`;

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
            UserID: actorUserId,
            CreatedByName: order.CustomerName,
            ApprovedByUserID: actorUserId,
            ApprovedByName: actorName,
            ApprovedAt: new Date(),
            ClinicalOverrideCode: isCriticalOrHigh ? clinicalOverrideCode : null,
            ClinicalOverrideNote: clinicalReviewNote?.trim() || 'Đạt kiểm duyệt Dược lâm sàng GPP',
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
              create: invoiceItemsData.map(({ allocations, ...lineData }) => ({
                ...lineData,
                ...(allocations.length > 0
                  ? {
                      lotAllocations: {
                        create: allocations.map((alloc) => ({
                          LotID: alloc.lotId,
                          BatchNumber: alloc.batchNumber,
                          ExpiryDate: alloc.expiryDate,
                          Quantity: alloc.quantity,
                        })),
                      },
                    }
                  : {}),
              })),
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
            items: { include: { lotAllocations: true } },
          },
        });

        // S1/S2 AUDIT: Ghi nhật ký thẩm định dược lâm sàng GPP
        await recordClinicalAuditLogTx(tx, {
          actorUserId,
          actorName,
          actorRole,
          contextType: 'ONLINE_ORDER_REVIEW',
          invoiceId: createdInvoice.InvoiceID,
          onlineOrderId: order.OrderID,
          customerId: order.CustomerID,
          patientAllergies: clinicalAssessment.patientAllergies || order.PatientAllergies,
          action: clinicalAssessment.hasCriticalAllergy
            ? 'OVERRIDE_ALLERGY'
            : clinicalAssessment.requiresPharmacistReview
            ? 'OVERRIDE_INTERACTION'
            : 'APPROVE_RX',
          reasonCode:
            clinicalOverrideCode ||
            (clinicalAssessment.requiresPharmacistReview ? 'PHARMACIST_VERIFIED' : 'CLEAN_RX_APPROVAL'),
          reasonNote: clinicalReviewNote?.trim() || 'Đã kiểm duyệt Dược lâm sàng GPP',
          warnings: clinicalAssessment.warnings,
        });

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

        const approved = await tx.onlineOrder.update({
          where: { OrderID: order.OrderID },
          data: {
            Status: 'CONFIRMED',
            ClinicalSafetyStatus: clinicalAssessment.requiresPharmacistReview
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
            items: { include: { product: true, lotAllocations: true } },
            reservations: true,
            invoice: {
              include: {
                payment: true,
                paymentTransactions: true,
              },
            },
          },
        });

        const { TrackingTokenHash: _h, TrackingToken: _t, ...safeApproved } = approved;
        return {
          statusCode: 200,
          body: {
            success: true,
            message: `Đã duyệt đơn ${safeApproved.OrderCode}, chuyển giữ kho thành xuất bán FEFO và phát hành hóa đơn ${safeApproved.invoice?.InvoiceCode}!`,
            data: safeApproved,
          },
        };
      }
    );

    res.status(idemResult.statusCode).json(idemResult.body);
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
          invoice: {
            include: {
              items: { include: { product: true, lotAllocations: true } },
              customer: true,
            },
          },
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

        // Hoàn lại kho cho Hóa đơn liên kết nếu hủy sau khi đã CONFIRMED (D1 exact multi-lot restore)
        if (order.invoice && order.invoice.Status !== 'REFUNDED') {
          for (const invItem of order.invoice.items) {
            if (!invItem.product) continue;
            await packagingService.restoreStockOnRefund(
              invItem.product,
              invItem.BaseQuantityDeducted ?? 0,
              invItem.LooseUnitsDeducted ?? 0,
              tx,
              {
                lotId: invItem.LotID,
                batchNumber: invItem.BatchNumber,
                lotAllocations: invItem.lotAllocations.map((alloc) => ({
                  lotId: alloc.LotID,
                  batchNumber: alloc.BatchNumber,
                  quantity: alloc.Quantity,
                })),
              }
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

const patientContextSchema = z
  .object({
    ageGroup: z.enum(['ADULT', 'CHILD', 'ELDERLY']).optional(),
    pregnantOrBreastfeeding: z.boolean().optional(),
    allergies: z.string().trim().max(150).optional(),
    chronicConditions: z.string().trim().max(150).optional(),
  })
  .optional();

const storefrontChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(2, 'Vui lòng nhập câu hỏi tối thiểu 2 ký tự')
    .max(500, 'Câu hỏi tối đa 500 ký tự'),
  mode: z.enum(['DRUG_QA', 'SYMPTOM_CONSULTATION']).optional(),
  productIdContext: z.coerce.number().int().positive().optional(),
  patientContext: patientContextSchema,
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().max(400),
      })
    )
    .max(4)
    .optional()
    .default([]),
});

function handleStorefrontAiError(res: Response, error: unknown): void {
  if (error instanceof AiServiceError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      model: error.model,
      message: error.message,
    });
    return;
  }
  res.status(503).json({
    success: false,
    code: 'STOREFRONT_AI_UNAVAILABLE',
    message: 'Trợ lý AI hiện tạm gián đoạn. Vui lòng chọn "Gặp Dược sĩ" để được gọi lại miễn phí.',
  });
}

function parseStorefrontChatInput(req: Request, res: Response) {
  const parsed = storefrontChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      code: 'INVALID_CHAT_QUERY',
      message: 'Nội dung câu hỏi chưa hợp lệ (2–500 ký tự).',
      errors: parsed.error.flatten().fieldErrors,
    });
    return null;
  }
  return parsed.data;
}

/**
 * 10a. STOREFRONT PUBLIC AI CHAT (JSON) - POST /api/online-orders/assistant/chat
 * Công khai có rate-limit & A6 DTO Allowlist (không lộ tồn kho thô/giá sỉ).
 */
export const storefrontAssistantChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = parseStorefrontChatInput(req, res);
    if (!input) return;

    const result = await aiGatewayService.chatForStorefront({
      message: input.message,
      mode: input.mode,
      history: input.history,
      productIdContext: input.productIdContext,
      patientContext: input.patientContext,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleStorefrontAiError(res, error);
  }
};

/**
 * 10b. STOREFRONT PUBLIC AI CHAT (SSE STREAMING) - POST /api/online-orders/assistant/chat-stream
 */
export const storefrontAssistantChatStream = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = parseStorefrontChatInput(req, res);
    if (!input) return;

    await aiGatewayService.streamChatToExpressRes(
      {
        message: input.message,
        mode: input.mode,
        history: input.history,
        audience: 'CUSTOMER',
        onlyStorefrontPublished: true,
        productIdContext: input.productIdContext,
        patientContext: input.patientContext,
      },
      res
    );
  } catch (error) {
    if (!res.headersSent) {
      handleStorefrontAiError(res, error);
    } else {
      res.end();
    }
  }
};

/**
 * 10c. STOREFRONT PUBLIC VOICE STT (FASTER-WHISPER) - POST /api/online-orders/assistant/speech-to-text
 */
export const storefrontAssistantSpeechToText = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        code: 'MISSING_AUDIO_FILE',
        message: 'Vui lòng ghi âm giọng nói trước khi gửi.',
      });
      return;
    }
    if (req.file.size > 5 * 1024 * 1024) {
      res.status(413).json({
        success: false,
        code: 'AUDIO_TOO_LARGE',
        message: 'Đoạn ghi âm Storefront tối đa 5MB.',
      });
      return;
    }

    const language = String(req.body?.language || 'vi').slice(0, 8);
    const result = await aiGatewayService.speechToText(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      language
    );

    res.json({
      success: true,
      data: {
        text: result.text,
        language: result.language,
        processingTimeSec: result.processingTimeSec,
        modelUsed: result.modelUsed,
      },
    });
  } catch (error) {
    handleStorefrontAiError(res, error);
  }
};
