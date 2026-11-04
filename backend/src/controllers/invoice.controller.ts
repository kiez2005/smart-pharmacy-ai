import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';

const invoiceItemSchema = z.object({
  ProductID: z.coerce.number().int().positive(),
  Quantity: z.coerce.number().int().positive('Số lượng mua phải >= 1'),
  DosageNote: z.string().trim().optional().default('Sáng 1 viên, Tối 1 viên sau ăn'),
});

const createInvoiceSchema = z.object({
  CustomerName: z.string().trim().min(2, 'Vui lòng nhập tên khách hàng / bệnh nhân'),
  CustomerPhone: z.string().trim().optional().default(''),
  CustomerID: z.coerce.number().int().positive().optional(),
  Discount: z.coerce.number().min(0).optional().default(0),
  Note: z.string().trim().optional().default(''),
  PaymentMethod: z.enum(['CASH', 'VIETQR', 'CARD']).optional().default('VIETQR'),
  items: z.array(invoiceItemSchema).min(1, 'Hóa đơn phải có ít nhất 1 sản phẩm thuốc'),
});

/**
 * LẤY DANH SÁCH HÓA ĐƠN & THANH TOÁN (GET /api/invoices)
 */
export const getInvoices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const invoices = await prisma.invoice.findMany({
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
 * TẠO HÓA ĐƠN BÁN THUỐC & THANH TOÁN + TỰ ĐỘNG TRỪ TỒN KHO PRODUCT (POST /api/invoices)
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

    const { CustomerName, CustomerPhone, CustomerID, Discount, Note, PaymentMethod, items } =
      parsed.data;

    const createdInvoice = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const preparedItems: Array<{
        ProductID: number;
        Quantity: number;
        UnitPrice: number;
        DosageNote: string;
      }> = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { ProductID: item.ProductID },
        });

        if (!product) {
          throw new Error(`Không tìm thấy thuốc có mã #${item.ProductID}`);
        }

        if (product.Quantity < item.Quantity) {
          throw new Error(
            `Thuốc "${product.ProductName}" chỉ còn tồn kho ${product.Quantity} ${product.Unit}`
          );
        }

        // Trừ số lượng tồn kho của Product
        await tx.product.update({
          where: { ProductID: product.ProductID },
          data: { Quantity: product.Quantity - item.Quantity },
        });

        subtotal += product.Price * item.Quantity;
        preparedItems.push({
          ProductID: product.ProductID,
          Quantity: item.Quantity,
          UnitPrice: product.Price,
          DosageNote: item.DosageNote,
        });
      }

      const finalTotal = Math.max(0, subtotal - Discount);

      // Cộng điểm tích lũy cho bệnh nhân nếu có hồ sơ CustomerID
      if (CustomerID) {
        const pointsEarned = Math.floor(finalTotal / 10000);
        if (pointsEarned > 0) {
          await tx.customer.update({
            where: { CustomerID },
            data: { LoyaltyPoints: { increment: pointsEarned } },
          });
        }
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
      data: createdInvoice,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Lỗi khi lập hóa đơn',
    });
  }
};

/**
 * HỦY / HOÀN TRẢ HÓA ĐƠN & TỰ ĐỘNG CỘNG TRẢ LẠI TỒN KHO PRODUCT
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
        include: { items: true, payment: true },
      });

      if (!invoice) {
        throw new Error('Không tìm thấy chứng từ hóa đơn');
      }

      if (invoice.Status === 'REFUNDED') {
        throw new Error('Hóa đơn này đã được hoàn trả trước đó');
      }

      // Hoàn trả lại số lượng vào bảng Product
      for (const item of invoice.items) {
        await tx.product.update({
          where: { ProductID: item.ProductID },
          data: { Quantity: { increment: item.Quantity } },
        });
      }

      if (invoice.payment) {
        await tx.payment.update({
          where: { PaymentID: invoice.payment.PaymentID },
          data: { Status: 'REFUNDED' },
        });
      }

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
      message: `Đã hoàn trả hóa đơn ${updated.InvoiceCode} và nhập lại thuốc vào kho`,
      data: updated,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể hoàn trả hóa đơn',
    });
  }
};
