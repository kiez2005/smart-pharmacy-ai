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
  CustomerName: z.string().trim().min(2, 'Vui lòng nhập tên khách hàng / bệnh nhân'),
  CustomerPhone: z.string().trim().optional().default(''),
  CustomerID: z.coerce.number().int().positive().nullable().optional(),
  Discount: z.coerce.number().min(0, 'Số tiền chiết khấu không được âm').optional().default(0),
  UsedPoints: z.coerce.number().int().min(0, 'Số điểm tích lũy không được âm').optional().default(0),
  Note: z.string().trim().optional().default(''),
  PaymentMethod: z.enum(['CASH', 'VIETQR', 'CARD']).optional().default('VIETQR'),
  items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất 1 sản phẩm thuốc'),
});

/**
 * LẤY DANH SÁCH HÓA ĐƠN & THANH TOÁN (GET /api/invoices)
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
 * TẠO HÓA ĐƠN BÁN THUỐC & THANH TOÁN + TRỪ TỒN KHO THEO QUY CÁCH (POST /api/invoices)
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
          throw new Error(`Không tìm thấy hồ sơ bệnh nhân mã #${CustomerID}`);
        }

        if (UsedPoints > 0 && customerRecord.LoyaltyPoints < UsedPoints) {
          throw new Error(
            `Bệnh nhân "${customerRecord.FullName}" không đủ điểm tích lũy để quy đổi! (Hiện có: ${customerRecord.LoyaltyPoints} điểm, yêu cầu: ${UsedPoints} điểm)`
          );
        }
      } else if (UsedPoints > 0) {
        throw new Error('Chỉ khách hàng có hồ sơ thành viên mới được sử dụng điểm tích lũy');
      }

      // 2. Tính toán tiền hàng và trừ tồn kho theo quy cách
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

        // Tính toán quy đổi đơn vị bán, đơn giá chuẩn và tồn kho cần trừ
        const calc = await packagingService.calculateDeductionAndPrice(
          product,
          item.Unit,
          item.Quantity,
          tx
        );

        // Cập nhật tồn kho hộp nguyên trong bảng Product (nếu có mở hộp)
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
          `Tổng chiết khấu (${totalDiscount.toLocaleString('vi-VN')} đ: Chiết khấu ${Discount.toLocaleString('vi-VN')} đ + Đổi điểm ${pointDiscount.toLocaleString('vi-VN')} đ) không được vượt quá tổng giá trị đơn hàng (${subtotal.toLocaleString('vi-VN')} đ)!`
        );
      }

      const finalTotal = Math.max(0, subtotal - totalDiscount);
      const pointsEarned = Math.floor(finalTotal / 10000); // 10.000đ = 1 điểm tích lũy mới

      // Cập nhật số dư điểm của khách hàng trong cùng transaction
      if (CustomerID && customerRecord) {
        const updatedPoints = customerRecord.LoyaltyPoints - UsedPoints + pointsEarned;
        await tx.customer.update({
          where: { CustomerID },
          data: { LoyaltyPoints: Math.max(0, updatedPoints) },
        });
      }

      const invoiceCode = `HD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const txCode = `${PaymentMethod}-${String(Date.now()).slice(-6)}`;

      return tx.invoice.create({
        data: {
          InvoiceCode: invoiceCode,
          CustomerName,
          CustomerPhone,
          ...(CustomerID ? { CustomerID } : {}),
          Discount,
          UsedPoints,
          PointsDiscount: pointDiscount,
          PointsEarned: pointsEarned,
          Note,
          TotalAmount: finalTotal,
          Status: 'PAID',
          items: {
            create: preparedItems,
          },
          payment: {
            create: {
              PaymentMethod,
              TransactionCode: txCode,
              PaidAmount: finalTotal,
              Status: 'COMPLETED',
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
      message: `Lập hóa đơn ${createdInvoice.InvoiceCode} và thanh toán thành công`,
      data: {
        ...createdInvoice,
        Status: 'COMPLETED',
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
 * HỦY / HOÀN TRẢ HÓA ĐƠN & HOÀN LẠI KHO GỐC + ĐIỂM TÍCH LŨY
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

        // Nếu hóa đơn cũ chưa có BaseQuantityDeducted -> Hoàn trả số lượng an toàn theo Quantity
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

      // 2. Hoàn trả điểm tích lũy đã dùng & Thu hồi điểm thưởng đã cộng
      if (invoice.CustomerID && invoice.customer) {
        const restoredPoints =
          invoice.customer.LoyaltyPoints + invoice.UsedPoints - invoice.PointsEarned;
        await tx.customer.update({
          where: { CustomerID: invoice.CustomerID },
          data: { LoyaltyPoints: Math.max(0, restoredPoints) },
        });
      }

      // 3. Cập nhật trạng thái Payment sang REFUNDED
      if (invoice.payment) {
        await tx.payment.update({
          where: { PaymentID: invoice.payment.PaymentID },
          data: { Status: 'REFUNDED' },
        });
      }

      // 4. Cập nhật trạng thái Invoice sang REFUNDED
      return tx.invoice.update({
        where: { InvoiceID: invoiceId },
        data: { Status: 'REFUNDED' },
        include: {
          items: { include: { product: true } },
          payment: true,
          customer: true,
        },
      });
    });

    res.json({
      success: true,
      message: `Đã hoàn trả hóa đơn ${updated.InvoiceCode}, cộng trả thuốc vào kho và khôi phục điểm tích lũy thành công!`,
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
