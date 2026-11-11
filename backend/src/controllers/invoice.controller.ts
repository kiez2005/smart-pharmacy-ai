import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { packagingService } from '../services/packaging.service';

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
  PaymentMethod: z.enum(['CASH', 'VIETQR', 'CARD', 'CREDIT', 'COD']).optional().default('VIETQR'),
  items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất 1 sản phẩm thuốc'),
});

/**
 * LẤY DANH SÁCH HÓA ĐƠN ĐA KÊNH: POS, BÁN BUÔN B2B & ONLINE (GET /api/invoices)
 */
export const getInvoices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rawInvoices = await prisma.invoice.findMany({
      include: {
        items: {
          include: {
            product: true,
          },
        },
        payment: true,
        customer: true,
      },
      orderBy: { CreateDate: 'desc' },
    });

    const invoices = rawInvoices.map((inv) => ({
      ...inv,
      Status:
        inv.Status === 'PAID'
          ? 'COMPLETED'
          : inv.Status === 'REFUNDED'
          ? 'CANCELLED'
          : inv.Status,
    }));

    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách hóa đơn',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * TẠO HÓA ĐƠN BÁN LẺ POS / BÁN BUÔN B2B / ĐẶT HÀNG ONLINE + TRỪ TỒN KHO QUY CÁCH (POST /api/invoices)
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

    const {
      CustomerName,
      CustomerPhone,
      CustomerID,
      OrderType,
      Channel,
      ShippingAddress,
      ShippingMethod,
      ShippingFee,
      VatRate,
      PaidAmount,
      Discount,
      UsedPoints,
      Note,
      PaymentMethod,
      items,
    } = parsed.data;

    const createdInvoice = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra điểm tích lũy của khách hàng nếu có yêu cầu dùng điểm
      const pointDiscount = (UsedPoints || 0) * 1000; // 1 điểm = 1.000 VNĐ
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

      // 2. Tính toán tiền hàng và trừ tồn kho theo quy cách (Bán lẻ GPP / Bán buôn GDP)
      let subtotal = 0;
      const preparedItems: Array<{
        ProductID: number;
        Quantity: number;
        Unit: string;
        UnitPrice: number;
        BaseQuantityDeducted: number;
        LooseUnitsDeducted: number;
        DosageNote: string;
      }> = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { ProductID: item.ProductID },
        });

        if (!product) {
          throw new Error(`Không tìm thấy thuốc có mã #${item.ProductID}`);
        }

        // Tính toán quy đổi đơn vị bán, đơn giá chuẩn (Lẻ hoặc Sỉ B2B) và tồn kho cần trừ
        const calc = await packagingService.calculateDeductionAndPrice(
          product,
          item.Unit,
          item.Quantity,
          tx,
          OrderType
        );

        // Cập nhật tồn kho hộp nguyên trong bảng Product (nếu có mở hộp / xuất hộp / xuất thùng)
        if (calc.packagesToOpen > 0) {
          await tx.product.update({
            where: { ProductID: product.ProductID },
            data: { Quantity: product.Quantity - calc.packagesToOpen },
          });
        }

        // Cập nhật số thuốc lẻ dở dang trong bảng ProductPackaging
        const spec = await packagingService.getOrCreatePackagingSpec(product, tx);
        await tx.productPackaging.update({
          where: { PackagingID: spec.PackagingID },
          data: { LooseUnits: calc.newLooseUnits },
        });

        subtotal += calc.unitPrice * item.Quantity;

        preparedItems.push({
          ProductID: product.ProductID,
          Quantity: item.Quantity,
          Unit: calc.requestedUnit,
          UnitPrice: calc.unitPrice,
          BaseQuantityDeducted: calc.packagesToOpen,
          LooseUnitsDeducted: calc.totalSmallestUnitsDeducted,
          DosageNote: item.DosageNote,
        });
      }

      // 3. RÀNG BUỘC CHIẾT KHẤU NGHIÊM NGẶT
      const totalDiscount = Discount + pointDiscount;
      if (totalDiscount > subtotal) {
        throw new Error(
          `Tổng chiết khấu (${totalDiscount.toLocaleString('vi-VN')} đ) không được vượt quá tổng tiền hàng (${subtotal.toLocaleString('vi-VN')} đ)!`
        );
      }

      const afterDiscount = Math.max(0, subtotal - totalDiscount);
      const vatAmount = Math.round(afterDiscount * ((VatRate || 0) / 100));
      const finalTotal = afterDiscount + vatAmount + (ShippingFee || 0);
      const pointsEarned = OrderType === 'RETAIL' ? Math.floor(afterDiscount / 10000) : 0;

      // Xác định số tiền thực thu và công nợ còn lại
      let actualPaid = finalTotal;
      if (PaymentMethod === 'CREDIT' || PaymentMethod === 'COD') {
        actualPaid = PaidAmount !== undefined ? Math.min(finalTotal, PaidAmount) : 0;
      } else if (PaidAmount !== undefined) {
        actualPaid = Math.min(finalTotal, PaidAmount);
      }
      const debtAmount = Math.max(0, finalTotal - actualPaid);

      // Kiểm tra hạn mức công nợ nếu là khách sỉ / đại lý mua nợ
      if (CustomerID && customerRecord) {
        if (debtAmount > 0 && OrderType === 'WHOLESALE') {
          const nextDebt = (customerRecord.DebtBalance || 0) + debtAmount;
          const limit = customerRecord.CreditLimit || 50000000;
          if (nextDebt > limit) {
            throw new Error(
              `Vượt hạn mức công nợ đại lý! Dư nợ sau đơn này (${nextDebt.toLocaleString('vi-VN')} đ) vượt quá hạn mức cho phép (${limit.toLocaleString('vi-VN')} đ).`
            );
          }
        }

        const updatedPoints = customerRecord.LoyaltyPoints - UsedPoints + pointsEarned;
        await tx.customer.update({
          where: { CustomerID },
          data: {
            LoyaltyPoints: Math.max(0, updatedPoints),
            DebtBalance: (customerRecord.DebtBalance || 0) + debtAmount,
          },
        });
      }

      const prefix =
        Channel === 'ONLINE' ? 'ONL' : OrderType === 'WHOLESALE' ? 'BB' : 'HD';
      const invoiceCode = `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const txCode = `${PaymentMethod}-${String(Date.now()).slice(-6)}`;

      const invoiceStatus =
        debtAmount === 0 ? 'PAID' : actualPaid > 0 ? 'PARTIAL' : 'DEBT';
      const fulfillmentStatus = Channel === 'ONLINE' ? 'PENDING' : 'COMPLETED';

      return tx.invoice.create({
        data: {
          InvoiceCode: invoiceCode,
          OrderType,
          Channel,
          FulfillmentStatus: fulfillmentStatus,
          CustomerName,
          CustomerPhone,
          ...(CustomerID ? { CustomerID } : {}),
          ShippingAddress,
          ShippingMethod,
          ShippingFee: ShippingFee || 0,
          VatAmount: vatAmount,
          PaidAmount: actualPaid,
          DebtAmount: debtAmount,
          Discount,
          UsedPoints,
          PointsDiscount: pointDiscount,
          PointsEarned: pointsEarned,
          Note,
          TotalAmount: finalTotal,
          Status: invoiceStatus,
          items: {
            create: preparedItems,
          },
          payment: {
            create: {
              PaymentMethod,
              TransactionCode: txCode,
              PaidAmount: actualPaid,
              Status: debtAmount === 0 ? 'COMPLETED' : 'PENDING',
            },
          },
        },
        include: {
          items: { include: { product: true } },
          payment: true,
          customer: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      message: `Đã lập chứng từ ${createdInvoice.InvoiceCode} thành công`,
      data: {
        ...createdInvoice,
        Status:
          createdInvoice.Status === 'PAID'
            ? 'COMPLETED'
            : createdInvoice.Status,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Lỗi khi lập hóa đơn',
    });
  }
};

/**
 * CẬP NHẬT TRẠNG THÁI XỬ LÝ & GIAO HÀNG ĐƠN ONLINE (PATCH /api/invoices/:id/fulfillment)
 */
export const updateFulfillmentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    const { fulfillmentStatus } = req.body as {
      fulfillmentStatus: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED';
    };

    if (!['PENDING', 'CONFIRMED', 'SHIPPING', 'COMPLETED'].includes(fulfillmentStatus)) {
      res.status(400).json({ success: false, message: 'Trạng thái giao vận không hợp lệ' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { InvoiceID: invoiceId },
        include: { payment: true, customer: true },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      // Nếu đơn giao thành công (COMPLETED) và là đơn COD -> tự động thu đủ tiền
      const isCompletingDebt = fulfillmentStatus === 'COMPLETED' && invoice.DebtAmount > 0;

      if (isCompletingDebt && invoice.CustomerID && invoice.customer) {
        await tx.customer.update({
          where: { CustomerID: invoice.CustomerID },
          data: {
            DebtBalance: Math.max(0, (invoice.customer.DebtBalance || 0) - invoice.DebtAmount),
          },
        });
      }

      if (isCompletingDebt && invoice.payment) {
        await tx.payment.update({
          where: { PaymentID: invoice.payment.PaymentID },
          data: {
            PaidAmount: invoice.TotalAmount,
            Status: 'COMPLETED',
          },
        });
      }

      return tx.invoice.update({
        where: { InvoiceID: invoiceId },
        data: {
          FulfillmentStatus: fulfillmentStatus,
          ...(isCompletingDebt
            ? {
                PaidAmount: invoice.TotalAmount,
                DebtAmount: 0,
                Status: 'PAID',
              }
            : {}),
        },
        include: {
          items: { include: { product: true } },
          payment: true,
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã cập nhật tiến độ đơn hàng ${updated.InvoiceCode} sang ${fulfillmentStatus}`,
      data: {
        ...updated,
        Status: updated.Status === 'PAID' ? 'COMPLETED' : updated.Status,
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
 * THU HỒI CÔNG NỢ HÓA ĐƠN BÁN BUÔN / KHÁCH SỈ (POST /api/invoices/:id/pay-debt)
 */
export const collectInvoiceDebt = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    const payAmount = Number(req.body?.amount || 0);

    if (isNaN(invoiceId) || payAmount <= 0) {
      res.status(400).json({
        success: false,
        message: 'Số tiền thu nợ phải lớn hơn 0',
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { InvoiceID: invoiceId },
        include: { payment: true, customer: true },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy hóa đơn cần thu nợ');
      }
      if (invoice.DebtAmount <= 0) {
        throw new Error('Hóa đơn này đã được thanh toán đủ, không còn công nợ');
      }

      const collected = Math.min(invoice.DebtAmount, payAmount);
      const nextPaid = invoice.PaidAmount + collected;
      const nextDebt = Math.max(0, invoice.DebtAmount - collected);
      const nextStatus = nextDebt === 0 ? 'PAID' : 'PARTIAL';

      if (invoice.CustomerID && invoice.customer) {
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
            Status: nextDebt === 0 ? 'COMPLETED' : 'PARTIAL',
          },
        });
      }

      return tx.invoice.update({
        where: { InvoiceID: invoiceId },
        data: {
          PaidAmount: nextPaid,
          DebtAmount: nextDebt,
          Status: nextStatus,
        },
        include: {
          items: { include: { product: true } },
          payment: true,
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã thu công nợ hóa đơn ${updated.InvoiceCode} thành công`,
      data: {
        ...updated,
        Status: updated.Status === 'PAID' ? 'COMPLETED' : updated.Status,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể thu hồi công nợ',
    });
  }
};

/**
 * HỦY / HOÀN TRẢ HÓA ĐƠN & HOÀN LẠI KHO GỐC + ĐIỂM TÍCH LŨY + GIẢM CÔNG NỢ
 * POST /api/invoices/:id/cancel
 */
export const cancelInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const invoiceId = Number(req.params.id);
    if (isNaN(invoiceId)) {
      res.status(400).json({ success: false, message: 'Mã hóa đơn không hợp lệ' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { InvoiceID: invoiceId },
        include: { items: { include: { product: true } }, payment: true, customer: true },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy chứng từ hóa đơn');
      }

      // Đảm bảo tính duy nhất (Idempotent) - Chống hoàn trả 2 lần
      if (invoice.Status === 'REFUNDED' || invoice.Status === 'CANCELLED') {
        throw new Error('Hóa đơn này đã được hoàn trả trước đó, không thể hủy lần thứ hai!');
      }

      // 1. Hoàn trả lại tồn kho chính xác theo quy cách đóng gói
      for (const item of invoice.items) {
        if (!item.product) continue;

        const packagesDeducted =
          item.BaseQuantityDeducted !== null ? item.BaseQuantityDeducted : item.Quantity;
        const smallestUnitsDeducted =
          item.LooseUnitsDeducted !== null ? item.LooseUnitsDeducted : item.Quantity;

        await packagingService.restoreStockOnRefund(
          item.product,
          packagesDeducted,
          smallestUnitsDeducted,
          tx
        );
      }

      // 2. Hoàn trả điểm tích lũy đã dùng, thu hồi điểm thưởng & xóa dư nợ đơn hàng
      if (invoice.CustomerID && invoice.customer) {
        const restoredPoints =
          invoice.customer.LoyaltyPoints + invoice.UsedPoints - invoice.PointsEarned;
        const restoredDebt = Math.max(
          0,
          (invoice.customer.DebtBalance || 0) - (invoice.DebtAmount || 0)
        );
        await tx.customer.update({
          where: { CustomerID: invoice.CustomerID },
          data: {
            LoyaltyPoints: Math.max(0, restoredPoints),
            DebtBalance: restoredDebt,
          },
        });
      }

      // 3. Cập nhật trạng thái Payment sang REFUNDED
      if (invoice.payment) {
        await tx.payment.update({
          where: { PaymentID: invoice.payment.PaymentID },
          data: { Status: 'REFUNDED' },
        });
      }

      // 4. Cập nhật trạng thái Invoice sang REFUNDED & FulfillmentStatus sang CANCELLED
      return tx.invoice.update({
        where: { InvoiceID: invoiceId },
        data: {
          Status: 'REFUNDED',
          FulfillmentStatus: 'CANCELLED',
        },
        include: {
          items: { include: { product: true } },
          payment: true,
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã hoàn trả hóa đơn ${updated.InvoiceCode}, cộng trả thuốc vào kho và điều chỉnh công nợ/điểm thưởng thành công!`,
      data: {
        ...updated,
        Status: 'CANCELLED',
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể hoàn trả hóa đơn',
    });
  }
};
