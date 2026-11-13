import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { packagingService } from '../services/packaging.service';
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
  resolveSafePrescriptionFilePath,
  saveValidatedPrescriptionFile,
} from '../services/prescription-storage.service';
import { TRACKING_TOKEN_TTL_DAYS } from '../config/env';
import { calculateServerShippingFee } from './invoice.controller';

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
export const uploadPrescriptionImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        code: 'MISSING_FILE',
        message: 'Vui lòng chọn ảnh đơn thuốc hợp lệ (PNG, JPG hoặc WEBP <= 3MB).',
      });
      return;
    }

    const saved = saveValidatedPrescriptionFile(req.file.buffer);
    res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PRESCRIPTION_IMAGE') {
      res.status(400).json({
        success: false,
        code: 'INVALID_FILE_TYPE',
        message: 'Tệp không phải ảnh hợp lệ (chỉ chấp nhận JPEG, PNG, WEBP tối đa 3MB).',
      });
      return;
    }
    res.status(500).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: 'Không thể lưu ảnh đơn thuốc.',
    });
  }
};

/**
 * 0b. DƯỢC SĨ / ADMIN TẢI ẢNH ĐƠN THUỐC PRIVATE (GET /api/online-orders/prescriptions/:fileKey) - A5
 */
export const downloadPrescriptionImage = async (req: Request, res: Response): Promise<void> => {
  const fileKey = String(req.params.fileKey || '').trim();
  const safePath = resolveSafePrescriptionFilePath(fileKey);
  if (!safePath) {
    res.status(404).json({
      success: false,
      code: 'PRESCRIPTION_NOT_FOUND',
      message: 'Không tìm thấy tệp đơn thuốc hợp lệ.',
    });
    return;
  }

  const ext = fileKey.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${fileKey}"`);
  res.sendFile(safePath);
};

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

    // A5 FIX: Cấm nhúng ảnh Base64 vào JSON/Note; chỉ chấp nhận fileKey đã upload qua multipart endpoint
    if (
      (PrescriptionImage && /^data:image\//i.test(PrescriptionImage)) ||
      /data:image\//i.test(Note)
    ) {
      res.status(400).json({
        success: false,
        code: 'BASE64_INLINE_FORBIDDEN',
        message: 'Không nhúng ảnh Base64 trực tiếp vào đơn hàng. Vui lòng tải ảnh qua API tải đơn thuốc.',
      });
      return;
    }

    let validatedFileKey: string | null = null;
    let validatedFileMime: string | null = null;
    if (PrescriptionFileKey) {
      const resolvedPath = resolveSafePrescriptionFilePath(PrescriptionFileKey);
      if (!resolvedPath) {
        res.status(400).json({
          success: false,
          code: 'INVALID_PRESCRIPTION_FILE_KEY',
          message: 'Mã tệp ảnh đơn thuốc không tồn tại hoặc không hợp lệ.',
        });
        return;
      }
      validatedFileKey = PrescriptionFileKey;
      const ext = PrescriptionFileKey.split('.').pop()?.toLowerCase();
      validatedFileMime =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    }

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
    const fallbackParam = String(req.query.phoneOrToken || '').trim().toUpperCase();
    const trackingToken = headerToken || queryToken || (fallbackParam.startsWith('TRK-') ? fallbackParam : '');

    if (!orderCode || !trackingToken) {
      res.status(400).json({
        success: false,
        code: 'MISSING_TRACKING_CREDENTIALS',
        message: 'Vui lòng cung cấp đủ Mã đơn hàng (WEB-...) và Mã tra cứu bảo mật (TRK-...).',
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
export const getPublicStorefrontCatalog = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations().catch(() => 0);

    const search = String(req.query.search || '').trim().toLowerCase();
    const type = String(req.query.type || req.query.productType || '').trim();
    const inStockOnly = req.query.inStockOnly === 'true' || req.query.inStockOnly === '1';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit || 24)));
    const todayIso = new Date().toISOString().slice(0, 10);

    const baseWhere = {
      AND: [
        {
          packaging: {
            is: {
              IsPublished: true,
              IsTestOnly: false,
            },
          },
        },
        ...(type && type !== 'ALL' ? [{ ProductType: type }] : []),
      ],
    };

    const rawProducts = await prisma.product.findMany({
      where: baseWhere,
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
          },
        },
        stockLots: {
          where: { Status: 'ACTIVE', RemainingQuantity: { gt: 0 }, ExpiryDate: { gte: todayIso } },
          select: {
            RemainingQuantity: true,
          },
        },
      },
      orderBy: { ProductID: 'asc' },
    });

    const categoriesRows = await prisma.product.findMany({
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
    });

    const mapped = rawProducts
      .filter((p) => {
        if (!search) return true;
        return (
          p.ProductName.toLowerCase().includes(search) ||
          p.Description.toLowerCase().includes(search) ||
          p.ProductType.toLowerCase().includes(search)
        );
      })
      .map((p) => {
        const reservedBase = p.packaging?.ReservedBaseQty || 0;
        const physicalAvailable = Math.max(0, p.Quantity - reservedBase);
        const lotSum = p.stockLots.reduce((sum, l) => sum + l.RemainingQuantity, 0);
        const sellableBoxes = Math.max(0, Math.min(physicalAvailable, lotSum));
        const stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' =
          sellableBoxes <= 0 ? 'OUT_OF_STOCK' : sellableBoxes <= 15 ? 'LOW_STOCK' : 'IN_STOCK';

        const isRx =
          p.ProductType.toLowerCase().includes('kháng sinh') ||
          p.ProductType.toLowerCase().includes('tim mạch') ||
          p.ProductType.toLowerCase().includes('thần kinh') ||
          /augmentin|nexium|lipitor|glucophage|amoxicillin|cefuroxim|azithromycin/i.test(
            p.ProductName
          );

        return {
          inStock: sellableBoxes > 0,
          dto: {
            ProductID: p.ProductID,
            ProductName: p.ProductName,
            PathImage: p.PathImage,
            ProductType: p.ProductType,
            Unit: p.Unit,
            Price: p.Price,
            Description: p.Description,
            IsRx: isRx,
            StockStatus: stockStatus,
            InStock: sellableBoxes > 0,
            MaxOrderQty: sellableBoxes > 0 ? Math.min(sellableBoxes, 20) : 0,
            packaging: p.packaging
              ? {
                  PackageUnit: p.packaging.PackageUnit,
                  BlisterUnit: p.packaging.BlisterUnit,
                  BlistersPerPackage: p.packaging.BlistersPerPackage,
                  SmallestUnit: p.packaging.SmallestUnit,
                  UnitsPerPackage: p.packaging.UnitsPerPackage,
                  UnitsPerBlister: p.packaging.UnitsPerBlister,
                  AllowFractionalSale: p.packaging.AllowFractionalSale,
                }
              : null,
          },
        };
      })
      .filter((entry) => (!inStockOnly ? true : entry.inStock));

    const total = mapped.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const pagedItems = mapped
      .slice((safePage - 1) * limit, safePage * limit)
      .map((entry) => entry.dto);

    res.json({
      success: true,
      data: {
        items: pagedItems,
        total,
        page: safePage,
        limit,
        totalPages,
        categories: categoriesRows.map((c) => c.ProductType),
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
    await packagingService.releaseExpiredReservations();

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
              product: true,
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

    const formatted = orders.map((o) => {
      let clinicalWarnings: unknown[] = [];
      if (o.ClinicalWarningsJson) {
        try {
          clinicalWarnings = JSON.parse(o.ClinicalWarningsJson);
        } catch {
          clinicalWarnings = [];
        }
      }
      const { TrackingTokenHash: _h, TrackingToken: _t, ...safeOrder } = o;
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
