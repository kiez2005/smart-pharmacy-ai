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
  recordClinicalAuditLogTx,
} from '../services/clinical-safety.service';
import {
  handlePrescriptionDownloadHttp,
  handlePrescriptionUploadHttp,
  validatePrescriptionForProducts,
} from '../services/prescription-storage.service';

export const uploadInvoicePrescription = handlePrescriptionUploadHttp;
export const downloadInvoicePrescription = handlePrescriptionDownloadHttp;

const invoiceItemSchema = z.object({
  ProductID: z.coerce.number().int().positive(),
  Quantity: z.coerce.number().int().positive('Số lượng mua phải >= 1'),
  Unit: z.string().trim().optional(),
  DosageNote: z.string().trim().optional().default('Sáng 1 viên, Tối 1 viên sau ăn'),
});

const createInvoiceSchema = z.object({
  CustomerName: z.string().trim().min(2, 'Vui lòng nhập tên khách hàng / đại lý / bệnh nhân'),
  CustomerPhone: z.string().trim().optional().default(''),
  CustomerID: z.coerce.number().int().positive().nullable().optional(),
  OrderType: z.enum(['RETAIL', 'WHOLESALE']).optional().default('RETAIL'),
  Channel: z.enum(['POS', 'ONLINE']).optional().default('POS'),
  ShippingAddress: z.string().trim().optional().default(''),
  ShippingMethod: z.string().trim().optional().default('PICKUP'),
  ShippingFee: z.coerce.number().min(0).optional().default(0),
  VatRate: z.coerce.number().min(0).max(20).optional().default(0),
  PaidAmount: z.coerce.number().min(0).optional(),
  Discount: z.coerce.number().min(0, 'Số tiền chiết khấu không được âm').optional().default(0),
  UsedPoints: z.coerce.number().int().min(0, 'Số điểm tích lũy không được âm').optional().default(0),
  Note: z.string().trim().optional().default(''),
  ClinicalOverrideCode: z.string().trim().optional().default(''),
  ClinicalOverrideNote: z.string().trim().optional().default(''),
  PatientAllergies: z.string().trim().optional().default(''),
  PrescriptionFileKey: z.string().trim().optional(),
  PrescriptionImage: z.string().trim().optional(),
  PaymentMethod: z.enum(['CASH', 'VIETQR', 'CARD', 'CREDIT', 'COD']).optional().default('VIETQR'),
  idempotencyKey: z.string().trim().optional(),
  items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất 1 sản phẩm thuốc'),
});

/**
 * Tính phí vận chuyển chuẩn từ phía Server (Không tin dữ liệu ShippingFee từ client — Issue 9)
 */
export function calculateServerShippingFee(params: {
  channel: string;
  orderType: string;
  shippingMethod: string;
  netMerchandiseAmount: number;
}): number {
  const { channel, orderType, shippingMethod, netMerchandiseAmount } = params;
  if (channel === 'POS' || shippingMethod === 'PICKUP') return 0;
  if (orderType === 'WHOLESALE' || shippingMethod.includes('GDP')) return 0;
  if (netMerchandiseAmount >= 300000) return 0;
  if (shippingMethod.includes('EXPRESS') || shippingMethod.includes('2H')) return 30000;
  return 15000;
}

/**
 * LẤY DANH SÁCH HÓA ĐƠN ĐA KÊNH: POS, BÁN BUÔN B2B & ONLINE (GET /api/invoices)
 */
export const getInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    await packagingService.releaseExpiredReservations();

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;
    const statusFilter =
      typeof req.query.status === 'string' && req.query.status !== 'ALL'
        ? req.query.status.trim()
        : undefined;
    const paymentStatusFilter =
      typeof req.query.paymentStatus === 'string' && req.query.paymentStatus !== 'ALL'
        ? req.query.paymentStatus.trim()
        : undefined;
    const channelFilter =
      typeof req.query.channel === 'string' && req.query.channel !== 'ALL'
        ? req.query.channel.trim()
        : undefined;
    const search = String(req.query.search || '').trim();
    const isCashier = req.user?.Role === 'CASHIER';

    const whereClause: Record<string, unknown> = {};
    if (statusFilter) {
      whereClause.Status = statusFilter;
    }
    if (paymentStatusFilter) {
      whereClause.PaymentStatus = paymentStatusFilter;
    }
    if (channelFilter) {
      whereClause.Channel = channelFilter;
    }
    if (search) {
      whereClause.OR = [
        { InvoiceCode: { contains: search } },
        { CustomerName: { contains: search } },
        { CustomerPhone: { contains: search } },
      ];
    }

    const [total, rawInvoices] = await Promise.all([
      prisma.invoice.count({ where: whereClause }),
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              product: true,
              lotAllocations: true,
            },
          },
          payment: true,
          paymentTransactions: {
            orderBy: { CreateDate: 'desc' },
          },
          customer: isCashier
            ? {
                select: {
                  CustomerID: true,
                  CustomerCode: true,
                  FullName: true,
                  Phone: true,
                  CustomerType: true,
                  LoyaltyPoints: true,
                },
              }
            : true,
        },
        orderBy: { CreateDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const invoices = rawInvoices.map((inv) => ({
      ...inv,
      ClinicalOverrideNote: isCashier ? undefined : inv.ClinicalOverrideNote,
      Status:
        inv.Status === 'PAID' || inv.Status === 'PARTIAL' || inv.Status === 'DEBT'
          ? 'COMPLETED'
          : inv.Status === 'REFUNDED'
          ? 'CANCELLED'
          : inv.Status,
    }));

    res.json({
      success: true,
      data: invoices,
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
      message: 'Lỗi khi tải danh sách hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * TẠO HÓA ĐƠN BÁN LẺ POS / BÁN BUÔN B2B + TRỪ TỒN KHO NGUYÊN TỬ THEO LÔ FEFO (POST /api/invoices)
 */
export const createInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu hóa đơn không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || parsed.data.idempotencyKey;
    const actorKey = req.user ? `user:${req.user.UserID}` : 'pos-staff';

    const {
      CustomerName,
      CustomerPhone,
      CustomerID,
      OrderType,
      Channel,
      ShippingAddress,
      ShippingMethod,
      VatRate,
      PaidAmount,
      Discount,
      UsedPoints,
      Note,
      ClinicalOverrideCode,
      ClinicalOverrideNote,
      PatientAllergies,
      PrescriptionFileKey,
      PrescriptionImage,
      PaymentMethod,
      items,
    } = parsed.data;

    // Kiểm tra bắt buộc phân quyền Dược sĩ + ảnh toa thuốc cho mọi thuốc kê đơn (Rx) tại POS
    const rxValidation = await validatePrescriptionForProducts({
      productIds: items.map((i) => i.ProductID),
      prescriptionFileKey: PrescriptionFileKey,
      inlineImage: PrescriptionImage,
      note: Note,
      enforcePharmacistRole: true,
      canDispenseRx: canRoleOverrideClinicalSafety(req.user?.Role),
    });
    if (!rxValidation.ok) {
      res.status(rxValidation.status).json({
        success: false,
        code: rxValidation.code,
        message: rxValidation.message,
      });
      return;
    }

    // Kiểm tra an toàn dược lâm sàng (S1: Phân quyền Override + Mã lý do có cấu trúc)
    const clinicalSafety = await evaluateClinicalSafetyServerSide({
      productIds: items.map((i) => i.ProductID),
      customerId: CustomerID,
      patientAllergiesOverride: PatientAllergies,
    });

    const requiresClinicalOverride =
      clinicalSafety.hasCriticalAllergy || clinicalSafety.hasHighRiskWarning;

    if (requiresClinicalOverride) {
      if (!canRoleOverrideClinicalSafety(req.user?.Role)) {
        res.status(403).json({
          success: false,
          code: 'CLINICAL_OVERRIDE_ROLE_REQUIRED',
          message:
            'Thu ngân (CASHIER) không được phép tự vượt cảnh báo dị ứng / tương tác thuốc nguy cơ cao. Yêu cầu Dược sĩ hoặc Quản trị viên xác nhận!',
          clinicalSafety,
        });
        return;
      }

      if (
        !isValidOverrideReasonCode(ClinicalOverrideCode) ||
        !ClinicalOverrideNote ||
        ClinicalOverrideNote.trim().length < 10
      ) {
        res.status(422).json({
          success: false,
          code: 'CLINICAL_SAFETY_BLOCK',
          message:
            clinicalSafety.warnings[0]?.detail ||
            'Phát hiện cảnh báo lâm sàng mức CAO / dị ứng thuốc! Dược sĩ cần chọn mã lý do chuẩn (ClinicalOverrideCode) và ghi chú >= 10 ký tự.',
          clinicalSafety,
        });
        return;
      }
    }

    const idemResult = await runWithIdempotencyTx(
      {
        rawKey: rawIdemKey,
        scope: 'CREATE_INVOICE',
        actorKey,
        payload: parsed.data,
      },
      async (tx) => {
      await packagingService.releaseExpiredReservations(tx);

      // 1. Kiểm tra hồ sơ khách hàng / đại lý B2B & điểm tích lũy
      const pointDiscount = (UsedPoints || 0) * 1000;
      let customerRecord = null;

      if (CustomerID) {
        customerRecord = await tx.customer.findUnique({
          where: { CustomerID },
        });

        if (!customerRecord) {
          throw new Error(`Không tìm thấy hồ sơ khách hàng / đại lý mã #${CustomerID}`);
        }

        if (UsedPoints > 0 && customerRecord.LoyaltyPoints < UsedPoints) {
          throw new Error(
            `Khách hàng "${customerRecord.FullName}" không đủ điểm tích lũy để quy đổi! (Hiện có: ${customerRecord.LoyaltyPoints} điểm, yêu cầu: ${UsedPoints} điểm)`
          );
        }
      } else if (UsedPoints > 0) {
        throw new Error('Chỉ khách hàng có hồ sơ thành viên mới được sử dụng điểm tích lũy');
      }

      const isVerifiedWholesaleCustomer = customerRecord?.CustomerType === 'WHOLESALE';

      // 2. Tính toán tiền hàng và trừ tồn kho nguyên tử kèm phân bổ lô FEFO (Issue 13, 15, 22)
      let subtotal = 0;
      let anyWholesaleLine = isVerifiedWholesaleCustomer && OrderType === 'WHOLESALE';

      const preparedItems: Array<{
        ProductID: number;
        Quantity: number;
        Unit: string;
        UnitPrice: number;
        BaseQuantityDeducted: number;
        LooseUnitsDeducted: number;
        BatchNumber: string | null;
        ExpiryDate: string | null;
        LotID: number | null;
        allocations: Array<{ lotId: number; batchNumber: string; expiryDate: string; quantity: number }>;
        DosageNote: string;
      }> = [];

      for (const item of items) {
        const deducted = await packagingService.deductStockAtomically(
          item.ProductID,
          item.Unit,
          item.Quantity,
          tx,
          {
            orderType: OrderType,
            isVerifiedWholesaleCustomer,
          }
        );

        if (deducted.effectiveOrderType === 'WHOLESALE') {
          anyWholesaleLine = true;
        }

        subtotal += deducted.unitPrice * item.Quantity;

        preparedItems.push({
          ProductID: item.ProductID,
          Quantity: item.Quantity,
          Unit: deducted.requestedUnit,
          UnitPrice: deducted.unitPrice,
          BaseQuantityDeducted: deducted.packagesToOpen,
          LooseUnitsDeducted: deducted.totalSmallestUnitsDeducted,
          BatchNumber: deducted.batchNumber,
          ExpiryDate: deducted.expiryDate,
          LotID: deducted.lotId,
          allocations: deducted.allocations || [],
          DosageNote: item.DosageNote,
        });
      }

      const effectiveOrderType: 'RETAIL' | 'WHOLESALE' = anyWholesaleLine
        ? 'WHOLESALE'
        : 'RETAIL';

      // 3. Ràng buộc chiết khấu và tính Thuế/Phí ship chuẩn từ Server (Issue 9)
      const totalDiscount = Discount + pointDiscount;
      if (totalDiscount > subtotal) {
        throw new Error(
          `Tổng chiết khấu (${totalDiscount.toLocaleString('vi-VN')} đ) không được vượt quá tổng tiền hàng (${subtotal.toLocaleString('vi-VN')} đ)!`
        );
      }

      const afterDiscount = Math.max(0, subtotal - totalDiscount);
      const serverVatRate = VatRate && VatRate > 0 ? 5 : 0;
      const vatAmount = Math.round(afterDiscount * (serverVatRate / 100));
      const serverShippingFee = calculateServerShippingFee({
        channel: Channel,
        orderType: effectiveOrderType,
        shippingMethod: ShippingMethod,
        netMerchandiseAmount: afterDiscount,
      });

      const finalTotal = afterDiscount + vatAmount + serverShippingFee;
      const pointsEarned =
        effectiveOrderType === 'RETAIL' ? Math.floor(afterDiscount / 10000) : 0;

      // P0-03: Hóa đơn VIETQR khởi tạo ở trạng thái UNPAID (PaidAmount = 0) chờ đối soát thực thu
      // (không tự động ghi nhận PAID / CAPTURE trước khi xác nhận giao dịch ngân hàng).
      let actualPaid = finalTotal;
      if (PaymentMethod === 'VIETQR') {
        actualPaid = 0;
      } else if (PaymentMethod === 'CREDIT' || PaymentMethod === 'COD') {
        actualPaid = PaidAmount !== undefined ? Math.min(finalTotal, PaidAmount) : 0;
      } else if (PaidAmount !== undefined) {
        actualPaid = Math.min(finalTotal, PaidAmount);
      }
      const debtAmount = Math.max(0, finalTotal - actualPaid);

      // P0-02: Phương thức ghi nợ CREDIT bắt buộc phải chọn khách hàng loại WHOLESALE (Đại lý B2B)
      if (PaymentMethod === 'CREDIT') {
        if (!CustomerID || !customerRecord) {
          const err: any = new Error(
            'Bắt buộc chọn hồ sơ Đại lý B2B (WHOLESALE) khi ghi nhận công nợ (CREDIT)!'
          );
          err.statusCode = 400;
          err.code = 'CREDIT_CUSTOMER_REQUIRED';
          throw err;
        }
        if (customerRecord.CustomerType !== 'WHOLESALE') {
          const err: any = new Error(
            'Phương thức ghi nợ công nợ (CREDIT) chỉ áp dụng cho Đại lý bán buôn (WHOLESALE) đã được cấp hạn mức công nợ!'
          );
          err.statusCode = 400;
          err.code = 'RETAIL_CREDIT_FORBIDDEN';
          throw err;
        }
      }

      // Kiểm tra hạn mức công nợ và cập nhật dư nợ khách hàng nguyên tử (chỉ cộng vào DebtBalance nếu là mua nợ CREDIT)
      const customerDebtIncrease = PaymentMethod === 'CREDIT' ? debtAmount : 0;
      if (CustomerID && customerRecord) {
        const updatedPoints = Math.max(0, customerRecord.LoyaltyPoints - UsedPoints + pointsEarned);
        if (customerDebtIncrease > 0) {
          const limit = customerRecord.CreditLimit || 50000000;
          const maxAllowedCurrentDebt = limit - customerDebtIncrease;
          const atomicDebtUpdate = await tx.customer.updateMany({
            where: {
              CustomerID,
              CustomerType: 'WHOLESALE',
              DebtBalance: { lte: maxAllowedCurrentDebt },
            },
            data: {
              LoyaltyPoints: updatedPoints,
              DebtBalance: { increment: customerDebtIncrease },
            },
          });

          if (atomicDebtUpdate.count === 0) {
            const nextDebt = (customerRecord.DebtBalance || 0) + customerDebtIncrease;
            const err: any = new Error(
              `Vượt hạn mức công nợ đại lý! Dư nợ sau đơn này (${nextDebt.toLocaleString('vi-VN')} đ) vượt quá hạn mức cho phép (${limit.toLocaleString('vi-VN')} đ).`
            );
            err.statusCode = 422;
            err.code = 'CREDIT_LIMIT_EXCEEDED';
            throw err;
          }
        } else {
          await tx.customer.update({
            where: { CustomerID },
            data: {
              LoyaltyPoints: updatedPoints,
            },
          });
        }
      }

      const prefix =
        Channel === 'ONLINE' ? 'ONL' : effectiveOrderType === 'WHOLESALE' ? 'BB' : 'HD';
      const invoiceCode = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const txCode = `${PaymentMethod}-${String(Date.now()).slice(-6)}`;

      const paymentStatus =
        debtAmount === 0 ? 'PAID' : actualPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
      const fulfillmentStatus = Channel === 'ONLINE' ? 'CONFIRMED' : 'COMPLETED';
      const actorUserId = req.user?.UserID || null;
      const actorName = req.user?.FullName || 'Dược sĩ Thu ngân';

      const inv = await tx.invoice.create({
        data: {
          InvoiceCode: invoiceCode,
          OrderType: effectiveOrderType,
          Channel,
          FulfillmentStatus: fulfillmentStatus,
          PaymentStatus: paymentStatus,
          CustomerName,
          CustomerPhone,
          ...(CustomerID ? { CustomerID } : {}),
          ...(actorUserId ? { UserID: actorUserId } : {}),
          CreatedByName: actorName,
          ApprovedByUserID: actorUserId,
          ApprovedByName: actorName,
          ApprovedAt: new Date(),
          ClinicalOverrideCode: requiresClinicalOverride ? ClinicalOverrideCode : null,
          ClinicalOverrideNote: ClinicalOverrideNote || null,
          PrescriptionFileKey: rxValidation.fileKey,
          PrescriptionFileMime: rxValidation.fileMime,
          ShippingAddress,
          ShippingMethod,
          ShippingFee: serverShippingFee,
          VatAmount: vatAmount,
          PaidAmount: actualPaid,
          DebtAmount: debtAmount,
          Discount,
          UsedPoints,
          PointsDiscount: pointDiscount,
          PointsEarned: pointsEarned,
          Note,
          TotalAmount: finalTotal,
          Status: 'COMPLETED',
          items: {
            create: preparedItems.map(({ allocations, ...itemFields }) => ({
              ...itemFields,
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
              PaymentMethod,
              TransactionCode: txCode,
              PaidAmount: actualPaid,
              Status: debtAmount === 0 ? 'COMPLETED' : actualPaid > 0 ? 'PARTIAL' : 'UNPAID',
            },
          },
          ...(actualPaid > 0
            ? {
                paymentTransactions: {
                  create: [
                    {
                      EntryType: 'CAPTURE',
                      PaymentMethod,
                      Amount: actualPaid,
                      ReferenceCode: txCode,
                      ActorUserID: actorUserId,
                      ActorName: actorName,
                      Note: `Thu tiền khi lập hóa đơn ${invoiceCode}`,
                      Status: 'COMPLETED',
                    },
                  ],
                },
              }
            : {}),
        },
        include: {
          items: { include: { product: true, lotAllocations: true } },
          payment: true,
          paymentTransactions: true,
          customer: true,
        },
      });

      if (requiresClinicalOverride && actorUserId) {
        await recordClinicalAuditLogTx(tx, {
          actorUserId,
          actorName,
          actorRole: req.user?.Role || 'PHARMACIST',
          contextType: 'POS_INVOICE',
          invoiceId: inv.InvoiceID,
          customerId: CustomerID || null,
          patientAllergies: clinicalSafety.patientAllergies,
          action: clinicalSafety.hasCriticalAllergy ? 'OVERRIDE_ALLERGY' : 'OVERRIDE_INTERACTION',
          reasonCode: ClinicalOverrideCode,
          reasonNote: ClinicalOverrideNote,
          warnings: clinicalSafety.warnings,
        });
      }

      // Ghi sổ cái biến động kho Append-only (StockMovement — Issue 14)
      for (const createdItem of inv.items) {
        await tx.stockMovement.create({
          data: {
            ProductID: createdItem.ProductID,
            SourceType: 'INVOICE',
            SourceID: inv.InvoiceID,
            LineItemID: createdItem.ItemID,
            MovementType: 'EXPORT',
            Unit: createdItem.Unit || createdItem.product?.Unit || 'Hộp',
            Quantity: createdItem.Quantity,
            BaseQtyDelta: -(createdItem.BaseQuantityDeducted ?? 0),
            LooseQtyDelta: -(createdItem.LooseUnitsDeducted ?? 0),
            BatchNumber: createdItem.BatchNumber,
            ExpiryDate: createdItem.ExpiryDate,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Xuất kho theo hóa đơn ${inv.InvoiceCode}`,
          },
        });
      }

      return {
        statusCode: 201,
        body: {
          success: true,
          message: `Đã lập chứng từ ${inv.InvoiceCode} thành công`,
          data: {
            ...inv,
            Status: 'COMPLETED',
          },
        },
      };
    });

    res.status(idemResult.statusCode).json(idemResult.body);
  } catch (error: any) {
    if (error instanceof IdempotencyConflictError) {
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    const statusCode = error?.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      code: error?.code || 'INVOICE_CREATE_ERROR',
      message: error instanceof Error ? error.message : 'Lỗi khi lập hóa đơn',
    });
  }
};

/**
 * CẬP NHẬT TRẠNG THÁI GIAO VẬN THEO STATE MACHINE — ĐỘC LẬP VỚI THU TIỀN (PATCH /api/invoices/:id/fulfillment)
 * Giải quyết triệt để Issue 6 & Issue 7:
 * - Không cho phép nhảy cóc trạng thái hoặc sửa đơn đã hoàn tất/hủy.
 * - Giao hàng thành công (DELIVERED/COMPLETED) tuyệt đối KHÔNG tự ý xóa công nợ B2B hay tự ghi đã thu COD nếu chưa đối soát!
 */
const ALLOWED_FULFILLMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  PENDING_REVIEW: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['PACKING', 'SHIPPING', 'CANCELLED'],
  PACKING: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'COMPLETED'],
  DELIVERED: [],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const updateFulfillmentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    const { fulfillmentStatus, courierTrackingCode, rejectReason } = req.body as {
      fulfillmentStatus: string;
      courierTrackingCode?: string;
      rejectReason?: string;
    };

    if (!ALLOWED_FULFILLMENT_TRANSITIONS[fulfillmentStatus]) {
      res.status(400).json({ success: false, message: 'Trạng thái giao vận không hợp lệ' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { InvoiceID: invoiceId },
        include: { payment: true, customer: true },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy chứng từ hóa đơn');
      }

      if (invoice.Status === 'REFUNDED' || invoice.Status === 'CANCELLED') {
        throw new Error('Chứng từ đã hoàn trả/hủy, không thể cập nhật trạng thái giao vận!');
      }

      const currentFStatus = invoice.FulfillmentStatus || 'PENDING';
      const allowedNext = ALLOWED_FULFILLMENT_TRANSITIONS[currentFStatus] || [];

      if (!allowedNext.includes(fulfillmentStatus)) {
        throw new Error(
          `Chuyển trạng thái không hợp lệ: Không thể chuyển từ "${currentFStatus}" sang "${fulfillmentStatus}". Các bước hợp lệ tiếp theo: [${allowedNext.join(', ') || 'Đã kết thúc'}]`
        );
      }

      if (
        (fulfillmentStatus === 'REJECTED' || fulfillmentStatus === 'CANCELLED') &&
        (!rejectReason || rejectReason.trim().length < 3)
      ) {
        throw new Error('Vui lòng nhập lý do từ chối / hủy vận đơn!');
      }

      // Cập nhật có điều kiện theo trạng thái cũ để chống 2 nhân viên ghi đè nhau (Issue 7)
      const conditionalUpdate = await tx.invoice.updateMany({
        where: {
          InvoiceID: invoiceId,
          FulfillmentStatus: currentFStatus,
        },
        data: {
          FulfillmentStatus: fulfillmentStatus,
          ...(rejectReason ? { CancelReason: rejectReason.trim() } : {}),
          ...(courierTrackingCode
            ? { Note: `${invoice.Note || ''} [Mã vận đơn: ${courierTrackingCode}]`.trim() }
            : {}),
        },
      });

      if (conditionalUpdate.count !== 1) {
        throw new Error('Trạng thái đơn hàng vừa được nhân viên khác cập nhật. Vui lòng tải lại!');
      }

      return tx.invoice.findUniqueOrThrow({
        where: { InvoiceID: invoiceId },
        include: {
          items: { include: { product: true } },
          payment: true,
          paymentTransactions: true,
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã chuyển trạng thái vận chuyển đơn ${updated.InvoiceCode} sang ${fulfillmentStatus} (Trạng thái thanh toán giữ nguyên: ${updated.PaymentStatus})`,
      data: {
        ...updated,
        Status: updated.Status === 'REFUNDED' ? 'CANCELLED' : 'COMPLETED',
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Lỗi khi cập nhật trạng thái đơn hàng',
    });
  }
};

/**
 * THU HỒI CÔNG NỢ B2B HOẶC ĐỐI SOÁT TIỀN COD THỰC THU (POST /api/invoices/:id/pay-debt)
 * Giải quyết Issue 6, 18, 19, 21:
 * - Ghi nhận từng lần thu tiền vào bảng PaymentTransaction (Append-only ledger).
 * - Chỉ trừ Customer.DebtBalance nếu hóa đơn là đơn nợ CREDIT.
 * - Hỗ trợ Idempotency-Key chống thu trùng 2 lần.
 */
export const collectInvoiceDebt = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    const payAmount = Number(req.body?.amount || 0);
    const method = (req.body?.paymentMethod as string) || 'VIETQR';
    const rawRefCode = typeof req.body?.referenceCode === 'string' ? req.body.referenceCode.trim() : '';
    const note = (req.body?.note as string) || '';

    if (isNaN(invoiceId) || payAmount <= 0) {
      res.status(400).json({
        success: false,
        message: 'Số tiền thực thu phải lớn hơn 0',
      });
      return;
    }

    const rawIdemKey =
      (req.headers['idempotency-key'] as string | undefined) || req.body?.idempotencyKey;
    const actorKey = req.user ? `user:${req.user.UserID}` : 'staff';

    const idemResult = await runWithIdempotencyTx(
      {
        rawKey: rawIdemKey,
        scope: `COLLECT_DEBT:${invoiceId}`,
        actorKey,
        payload: { invoiceId, payAmount, method, referenceCode: rawRefCode },
      },
      async (tx): Promise<{ statusCode: number; body: any }> => {
        const invoice = await tx.invoice.findUnique({
          where: { InvoiceID: invoiceId },
          include: { payment: true, customer: true, onlineOrder: true, paymentTransactions: true },
        });

        if (!invoice) {
          throw new Error('Không tìm thấy hóa đơn cần thu tiền / đối soát');
        }
        if (invoice.Status === 'REFUNDED' || invoice.Status === 'CANCELLED') {
          throw new Error('Hóa đơn đã hủy/hoàn trả, không thể thu tiền');
        }

        const isVietQrReconcile =
          method === 'VIETQR' || invoice.payment?.PaymentMethod === 'VIETQR';

        // P0-03 & P2-02: Đối soát VietQR bắt buộc phải cung cấp mã tham chiếu giao dịch ngân hàng (ReferenceCode)
        if (isVietQrReconcile && rawRefCode.length < 3) {
          const err: any = new Error(
            'Đối soát thanh toán VietQR bắt buộc phải nhập Mã tham chiếu giao dịch ngân hàng (ReferenceCode / FT..., tối thiểu 3 ký tự)!'
          );
          err.statusCode = 400;
          err.code = 'VIETQR_REFERENCE_REQUIRED';
          throw err;
        }

        const referenceCode = rawRefCode || `RCPT-${String(Date.now()).slice(-6)}`;

        // Idempotency theo ReferenceCode trên cùng 1 hóa đơn
        if (rawRefCode) {
          const duplicateRef = invoice.paymentTransactions.find(
            (pt) => pt.ReferenceCode === rawRefCode && pt.Status === 'COMPLETED'
          );
          if (duplicateRef) {
            return {
              statusCode: 200,
              body: {
                success: true,
                message: `Giao dịch mã tham chiếu ${rawRefCode} đã được đối soát trước đó`,
                data: {
                  ...invoice,
                  Status: 'COMPLETED',
                },
              },
            };
          }
        }

        if (invoice.DebtAmount <= 0) {
          throw new Error('Hóa đơn này đã được thanh toán đủ, không còn số dư cần thu');
        }

        const collected = Math.min(invoice.DebtAmount, payAmount);
        const nextPaid = invoice.PaidAmount + collected;
        const nextDebt = Math.max(0, invoice.DebtAmount - collected);
        const nextPaymentStatus = nextDebt === 0 ? 'PAID' : 'PARTIALLY_PAID';

        const isCodCollection = invoice.payment?.PaymentMethod === 'COD';
        const entryType = isCodCollection
          ? 'COLLECT_COD'
          : invoice.payment?.PaymentMethod === 'VIETQR' && invoice.OrderType !== 'WHOLESALE'
          ? 'CAPTURE'
          : 'DEBT_COLLECTION';

        if (
          invoice.CustomerID &&
          invoice.customer &&
          invoice.payment?.PaymentMethod === 'CREDIT'
        ) {
          await tx.customer.update({
            where: { CustomerID: invoice.CustomerID },
            data: {
              DebtBalance: Math.max(0, (invoice.customer.DebtBalance || 0) - collected),
            },
          });
        }

        if (invoice.payment) {
          await tx.payment.update({
            where: { PaymentID: invoice.payment.PaymentID },
            data: {
              PaidAmount: nextPaid,
              TransactionCode: isVietQrReconcile && rawRefCode ? rawRefCode : invoice.payment.TransactionCode,
              Status: nextDebt === 0 ? 'COMPLETED' : 'PARTIAL',
            },
          });
        }

        await tx.paymentTransaction.create({
          data: {
            InvoiceID: invoice.InvoiceID,
            EntryType: entryType,
            PaymentMethod: method,
            Amount: collected,
            ReferenceCode: referenceCode,
            ActorUserID: req.user?.UserID || null,
            ActorName: req.user?.FullName || 'Kế toán Thu ngân',
            Note:
              note ||
              (isVietQrReconcile
                ? `Đối soát VietQR mã GD ${referenceCode} cho hóa đơn ${invoice.InvoiceCode}`
                : isCodCollection
                ? `Đối soát tiền thu hộ COD cho đơn ${invoice.InvoiceCode}`
                : `Thu công nợ B2B hóa đơn ${invoice.InvoiceCode}`),
            Status: 'COMPLETED',
          },
        });

        if (invoice.onlineOrder) {
          await tx.onlineOrder.update({
            where: { OrderID: invoice.onlineOrder.OrderID },
            data: {
              PaidAmount: nextPaid,
              PaymentStatus: nextPaymentStatus,
            },
          });
        }

        const updated = await tx.invoice.update({
          where: { InvoiceID: invoiceId },
          data: {
            PaidAmount: nextPaid,
            DebtAmount: nextDebt,
            PaymentStatus: nextPaymentStatus,
          },
          include: {
            items: { include: { product: true } },
            payment: true,
            paymentTransactions: { orderBy: { CreateDate: 'desc' } },
            customer: true,
          },
        });

        return {
          statusCode: 200,
          body: {
            success: true,
            message: `Đã ghi nhận phiếu thu ${updated.InvoiceCode} thành công`,
            data: {
              ...updated,
              Status: 'COMPLETED',
            },
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
      code: error?.code || 'COLLECT_DEBT_FAILED',
      message: error instanceof Error ? error.message : 'Không thể thu hồi công nợ',
    });
  }
};

/**
 * HỦY / HOÀN TRẢ HÓA ĐƠN & HOÀN KHO THEO LÔ + GHI BÚT TOÁN HOÀN TIỀN THỰC THU
 * POST /api/invoices/:id/cancel
 * Giải quyết Issue 11, 14, 18, 19:
 * - Chặn tự suy luận đối với hóa đơn legacy thiếu BaseQuantityDeducted/LooseUnitsDeducted.
 * - Ghi StockMovement (RETURN) có unique constraint chống hoàn 2 lần.
 * - Chỉ hoàn tiền tối đa bằng số tiền thực đã thu (PaidAmount) qua bút toán REFUND, và xóa phần công nợ qua bút toán VOID.
 */
export const cancelInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    const cancelReason =
      (req.body?.reason as string) || 'Khách hàng hoàn trả thuốc tại quầy theo quy định GPP';

    if (isNaN(invoiceId)) {
      res.status(400).json({ success: false, message: 'Mã hóa đơn không hợp lệ' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { InvoiceID: invoiceId },
        include: {
          items: { include: { product: true, lotAllocations: true } },
          payment: true,
          customer: true,
          onlineOrder: true,
        },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy chứng từ hóa đơn');
      }

      if (invoice.Status === 'REFUNDED' || invoice.Status === 'CANCELLED') {
        throw new Error('Hóa đơn này đã được hoàn trả trước đó, không thể hủy lần thứ hai!');
      }

      // Kiểm tra dữ liệu legacy: nếu dòng hóa đơn không lưu đủ BaseQuantityDeducted và LooseUnitsDeducted thì chặn tự suy luận (Issue 14)
      for (const item of invoice.items) {
        if (item.BaseQuantityDeducted === null && item.LooseUnitsDeducted === null) {
          const err: any = new Error(
            `Dòng thuốc #${item.ItemID} thuộc chứng từ cũ (legacy) chưa lưu định lượng quy đổi gốc. Hệ thống chuyển sang hàng chờ kiểm kê thủ công, không tự động suy luận số hộp hoàn kho!`
          );
          err.statusCode = 422;
          throw err;
        }
      }

      const actorUserId = req.user?.UserID || null;
      const actorName = req.user?.FullName || 'Dược sĩ Quản lý';

      // 1. Hoàn trả lại tồn kho chính xác theo quy cách & đúng Lô FEFO + ghi StockMovement (RETURN)
      for (const item of invoice.items) {
        if (!item.product) continue;

        const packagesDeducted = item.BaseQuantityDeducted ?? 0;
        const smallestUnitsDeducted = item.LooseUnitsDeducted ?? 0;

        // Ghi StockMovement với khóa unique (SourceType, SourceID, LineItemID, MovementType='RETURN') để đảm bảo không bao giờ đảo kho 2 lần
        await tx.stockMovement.create({
          data: {
            ProductID: item.ProductID,
            SourceType: 'INVOICE',
            SourceID: invoice.InvoiceID,
            LineItemID: item.ItemID,
            MovementType: 'RETURN',
            Unit: item.Unit || item.product.Unit,
            Quantity: item.Quantity,
            BaseQtyDelta: packagesDeducted,
            LooseQtyDelta: smallestUnitsDeducted,
            BatchNumber: item.BatchNumber,
            ExpiryDate: item.ExpiryDate,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Hoàn nhập kho từ hóa đơn hủy ${invoice.InvoiceCode}: ${cancelReason}`,
          },
        });

        await packagingService.restoreStockOnRefund(
          item.product,
          packagesDeducted,
          smallestUnitsDeducted,
          tx,
          {
            lotId: item.LotID,
            batchNumber: item.BatchNumber,
            lotAllocations: item.lotAllocations.map((alloc) => ({
              lotId: alloc.LotID,
              batchNumber: alloc.BatchNumber,
              quantity: alloc.Quantity,
            })),
          }
        );
      }

      // 2. Xử lý tài chính: Hoàn tiền tối đa bằng đúng số tiền thực đã thu (PaidAmount) + Đảo công nợ riêng (Issue 11)
      const actualCashRefund = Math.max(0, invoice.PaidAmount || 0);
      const voidedDebtAmount = Math.max(0, invoice.DebtAmount || 0);

      if (invoice.CustomerID && invoice.customer) {
        const restoredPoints =
          invoice.customer.LoyaltyPoints + invoice.UsedPoints - invoice.PointsEarned;
        const shouldReverseCustomerDebt =
          voidedDebtAmount > 0 && invoice.payment?.PaymentMethod === 'CREDIT';
        const restoredDebt = shouldReverseCustomerDebt
          ? Math.max(0, (invoice.customer.DebtBalance || 0) - voidedDebtAmount)
          : invoice.customer.DebtBalance || 0;

        await tx.customer.update({
          where: { CustomerID: invoice.CustomerID },
          data: {
            LoyaltyPoints: Math.max(0, restoredPoints),
            DebtBalance: restoredDebt,
          },
        });
      }

      if (actualCashRefund > 0) {
        await tx.paymentTransaction.create({
          data: {
            InvoiceID: invoice.InvoiceID,
            EntryType: 'REFUND',
            PaymentMethod: invoice.payment?.PaymentMethod || 'CASH',
            Amount: actualCashRefund,
            ReferenceCode: `REF-${invoice.InvoiceCode}`,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Chi hoàn tiền thực thu cho hóa đơn ${invoice.InvoiceCode} (${cancelReason})`,
            Status: 'COMPLETED',
          },
        });
      }

      if (voidedDebtAmount > 0) {
        await tx.paymentTransaction.create({
          data: {
            InvoiceID: invoice.InvoiceID,
            EntryType: 'VOID',
            PaymentMethod: invoice.payment?.PaymentMethod || 'CREDIT',
            Amount: voidedDebtAmount,
            ReferenceCode: `VOID-${invoice.InvoiceCode}`,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Hủy/Đảo khoản phải thu chưa thanh toán của hóa đơn ${invoice.InvoiceCode}`,
            Status: 'COMPLETED',
          },
        });
      }

      const finalPaymentStatus = actualCashRefund > 0 ? 'REFUNDED' : 'VOID';

      if (invoice.payment) {
        await tx.payment.update({
          where: { PaymentID: invoice.payment.PaymentID },
          data: { Status: finalPaymentStatus },
        });
      }

      if (invoice.onlineOrder) {
        await tx.onlineOrder.update({
          where: { OrderID: invoice.onlineOrder.OrderID },
          data: {
            Status: 'CANCELLED',
            PaymentStatus: finalPaymentStatus,
            RejectCancelReason: cancelReason,
          },
        });
      }

      return tx.invoice.update({
        where: { InvoiceID: invoiceId },
        data: {
          Status: 'REFUNDED',
          FulfillmentStatus: 'CANCELLED',
          PaymentStatus: finalPaymentStatus,
          RefundedAmount: actualCashRefund,
          DebtAmount: 0,
          CancelReason: cancelReason,
        },
        include: {
          items: { include: { product: true } },
          payment: true,
          paymentTransactions: { orderBy: { CreateDate: 'desc' } },
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã hoàn trả hóa đơn ${updated.InvoiceCode}: Hoàn tiền thực thu ${updated.RefundedAmount.toLocaleString('vi-VN')} đ và cộng trả thuốc về đúng lô kho!`,
      data: {
        ...updated,
        Status: 'CANCELLED',
      },
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể hoàn trả hóa đơn',
    });
  }
};
