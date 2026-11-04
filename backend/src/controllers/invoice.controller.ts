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

    const { CustomerName, CustomerPhone, Note, PaymentMethod, items } = parsed.data;

    const createdInvoice = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
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

        totalAmount += product.Price * item.Quantity;
        preparedItems.push({
          ProductID: product.ProductID,
          Quantity: item.Quantity,
          UnitPrice: product.Price,
          DosageNote: item.DosageNote,
        });
      }

      const invoiceCode = `HD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const txCode = `${PaymentMethod}-${String(Date.now()).slice(-6)}`;

      return tx.invoice.create({
        data: {
          InvoiceCode: invoiceCode,
          CustomerName,
          CustomerPhone,
          Note,
          TotalAmount: totalAmount,
          Status: 'PAID',
          items: {
            create: preparedItems,
          },
          payment: {
            create: {
              PaymentMethod,
              TransactionCode: txCode,
              PaidAmount: totalAmount,
              Status: 'COMPLETED',
            },
          },
        },
        include: {
          items: { include: { product: true } },
          payment: true,
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
