import { Request, Response } from 'express';
import { evaluateDrugSetSafety } from '../services/clinical-safety.service';
import ExcelJS from 'exceljs';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { isValidFutureIsoDate } from '../utils/date.util';

// ============================================================================
// 1. DASHBOARD ĐIỀU HÀNH & PHÂN TÍCH TỔNG QUAN (GET /api/enterprise/dashboard)
// ============================================================================
export const getDashboardAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [products, invoices, purchaseOrders, customers, contacts] = await Promise.all([
      prisma.product.findMany(),
      prisma.invoice.findMany({
        include: { items: { include: { product: true } }, payment: true },
        orderBy: { CreateDate: 'desc' },
      }),
      prisma.purchaseOrder.findMany({
        include: { supplier: true },
        orderBy: { CreateDate: 'desc' },
      }),
      prisma.customer.count(),
      prisma.contact.count({ where: { Status: 'NEW' } }),
    ]);

    // P1-02: Doanh thu thực thu (Net Collected Revenue) chỉ tính phần tiền đã thực thu trừ hoàn tiền.
    // Hóa đơn UNPAID tính 0đ; hóa đơn PARTIALLY_PAID chỉ tính PaidAmount đã thu; hóa đơn CANCELLED/REFUNDED loại trừ hoặc trừ RefundedAmount.
    const activeInvoices = invoices.filter(
      (i) => i.Status !== 'CANCELLED' && i.Status !== 'REFUNDED'
    );
    const totalRevenue = activeInvoices.reduce((sum, inv) => {
      const paymentStatus = inv.PaymentStatus || (inv.Status === 'PAID' ? 'PAID' : 'UNPAID');
      if (paymentStatus === 'UNPAID' || paymentStatus === 'VOID') {
        return sum;
      }
      const paid =
        typeof inv.PaidAmount === 'number' && inv.PaidAmount > 0
          ? inv.PaidAmount
          : paymentStatus === 'PAID'
          ? inv.TotalAmount
          : 0;
      const refunded = inv.RefundedAmount || 0;
      return sum + Math.max(0, paid - refunded);
    }, 0);

    const totalReceivableDebt = activeInvoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.DebtAmount || 0),
      0
    );

    const completedPurchaseOrders = purchaseOrders.filter(
      (po) => po.Status !== 'CANCELLED' && po.Status !== 'VOID'
    );
    const totalPurchaseCost = completedPurchaseOrders.reduce((s, po) => s + po.TotalCost, 0);
    const paidInvoices = activeInvoices.filter((inv) => {
      const paymentStatus = inv.PaymentStatus || (inv.Status === 'PAID' ? 'PAID' : 'UNPAID');
      return paymentStatus === 'PAID' || paymentStatus === 'PARTIALLY_PAID';
    });
    const totalInventoryValue = products.reduce((s, p) => s + p.Price * p.Quantity, 0);
    const totalStockUnits = products.reduce((s, p) => s + p.Quantity, 0);
    const outOfStockCount = products.filter((p) => p.Quantity <= 0).length;

    const lowStockProducts = products
      .filter((p) => p.Quantity <= 45)
      .sort((a, b) => a.Quantity - b.Quantity)
      .slice(0, 8);

    // Phân bổ theo nhóm dược lý
    const categoryMap = new Map<string, { count: number; quantity: number; value: number }>();
    for (const p of products) {
      const curr = categoryMap.get(p.ProductType) || { count: 0, quantity: 0, value: 0 };
      curr.count += 1;
      curr.quantity += p.Quantity;
      curr.value += p.Price * p.Quantity;
      categoryMap.set(p.ProductType, curr);
    }

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([type, stats]) => ({
        type,
        category: type,
        stock: stats.quantity,
        ...stats,
      }))
      .sort((a, b) => b.value - a.value);

    // Top thuốc xuất bán nhiều nhất
    const soldMap = new Map<
      number,
      { ProductID: number; ProductName: string; Unit: string; soldQty: number; revenue: number }
    >();
    for (const inv of paidInvoices) {
      for (const item of inv.items) {
        if (!item.product) continue;
        const curr = soldMap.get(item.ProductID) || {
          ProductID: item.ProductID,
          ProductName: item.product.ProductName,
          Unit: item.product.Unit,
          soldQty: 0,
          revenue: 0,
        };
        curr.soldQty += item.Quantity;
        curr.revenue += item.Quantity * item.UnitPrice;
        soldMap.set(item.ProductID, curr);
      }
    }

    const topSelling = Array.from(soldMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalReceivableDebt,
        totalPurchaseCost,
        totalInventoryValue,
        totalProducts: products.length,
        totalStockUnits,
        lowStockProducts,
        outOfStockCount,
        totalCustomers: customers,
        completedInvoicesCount: paidInvoices.length,
        categoryBreakdown,
        topSelling,
        topSellingProducts: topSelling,
        kpis: {
          totalRevenue,
          totalReceivableDebt,
          totalPurchaseCost,
          totalInventoryValue,
          totalProducts: products.length,
          totalInvoices: paidInvoices.length,
          totalCustomers: customers,
          pendingConsultations: contacts,
          lowStockCount: lowStockProducts.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Không thể tải dữ liệu phân tích tổng quan',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// ============================================================================
// 2. THẺ KHO CHI TIẾT SẢN PHẨM (GET /api/enterprise/products/:id/stock-card)
// ============================================================================
export const getProductStockCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const productId = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;

    const [product, totalMovements] = await Promise.all([
      prisma.product.findUnique({
        where: { ProductID: productId },
        include: {
          packaging: true,
          stockLots: {
            orderBy: [{ ExpiryDate: 'asc' }, { LotID: 'asc' }],
          },
          stockMovements: {
            orderBy: { CreateDate: 'desc' },
            skip,
            take: limit,
          },
        },
      }),
      prisma.stockMovement.count({ where: { ProductID: productId } }),
    ]);

    if (!product) {
      res.status(404).json({ success: false, message: 'Không tìm thấy dược phẩm' });
      return;
    }

    const [rawImports, rawExports] = await Promise.all([
      prisma.purchaseOrderItem.findMany({
        where: { ProductID: productId },
        include: {
          purchaseOrder: { include: { supplier: true } },
        },
        orderBy: { OrderItemID: 'desc' },
        skip,
        take: limit,
      }),
      prisma.invoiceItem.findMany({
        where: { ProductID: productId },
        include: {
          invoice: true,
        },
        orderBy: { ItemID: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const imports = rawImports.map((imp) => ({
      POItemID: imp.OrderItemID,
      BatchNumber: imp.BatchNumber,
      ExpiryDate: imp.ExpiryDate,
      Quantity: imp.Quantity,
      ImportPrice: imp.ImportPrice,
      purchaseOrder: {
        POCode: imp.purchaseOrder.OrderCode,
        Status: imp.purchaseOrder.Status,
        CreateDate: imp.purchaseOrder.CreateDate,
        supplier: imp.purchaseOrder.supplier,
      },
    }));

    const exports = rawExports.map((exp) => ({
      ItemID: exp.ItemID,
      Quantity: exp.Quantity,
      Unit: exp.Unit || product.Unit,
      BaseQuantityDeducted: exp.BaseQuantityDeducted ?? exp.Quantity,
      LooseUnitsDeducted: exp.LooseUnitsDeducted ?? 0,
      BatchNumber: exp.BatchNumber || 'LOT-FEFO-STD',
      ExpiryDate: exp.ExpiryDate || '2028-12-31',
      UnitPrice: exp.UnitPrice,
      DosageNote: exp.DosageNote,
      invoice: {
        InvoiceCode: exp.invoice.InvoiceCode,
        OrderType: exp.invoice.OrderType || 'RETAIL',
        Channel: exp.invoice.Channel || 'POS',
        CustomerName: exp.invoice.CustomerName,
        Status: exp.invoice.Status === 'PAID' ? 'COMPLETED' : exp.invoice.Status,
        PaymentStatus: exp.invoice.PaymentStatus || 'PAID',
        FulfillmentStatus: exp.invoice.FulfillmentStatus || 'COMPLETED',
        CreateDate: exp.invoice.CreateDate,
      },
    }));

    res.json({
      success: true,
      data: {
        product,
        stockLots: product.stockLots,
        stockMovements: product.stockMovements,
        imports,
        exports,
        pagination: {
          page,
          limit,
          total: totalMovements,
          totalPages: Math.max(1, Math.ceil(totalMovements / limit)),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải thẻ kho dược phẩm',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// ============================================================================
// 3. QUẢN LÝ NHÀ CUNG CẤP & PHIẾU NHẬP KHO (/suppliers & /purchase-orders)
// ============================================================================
const supplierSchema = z.object({
  SupplierCode: z.string().trim().optional(),
  SupplierName: z.string().trim().min(2),
  ContactPerson: z.string().trim().optional().default('Phòng Kinh Doanh'),
  Phone: z.string().trim().min(8),
  Email: z.string().trim().optional().default(''),
  Address: z.string().trim().optional().default('Việt Nam'),
  TaxCode: z.string().trim().optional().default(''),
});

export const getSuppliers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    const where = search
      ? {
          OR: [
            { SupplierName: { contains: search } },
            { SupplierCode: { contains: search } },
            { Phone: { contains: search } },
            { TaxCode: { contains: search } },
          ],
        }
      : {};

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        orderBy: { SupplierID: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: suppliers,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách nhà cung cấp',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const createSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Thông tin nhà cung cấp không hợp lệ' });
      return;
    }
    const code =
      parsed.data.SupplierCode && parsed.data.SupplierCode.length >= 2
        ? parsed.data.SupplierCode
        : `NCC-${String(Date.now()).slice(-4)}`;

    const created = await prisma.supplier.create({
      data: {
        ...parsed.data,
        SupplierCode: code,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Mã nhà cung cấp đã tồn tại hoặc dữ liệu lỗi',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

const purchaseOrderSchema = z.object({
  SupplierID: z.coerce.number().int().positive(),
  Note: z.string().trim().optional().default(''),
  CreatedBy: z.string().trim().optional().default('DS. Nguyễn Văn Trung'),
  items: z
    .array(
      z.object({
        ProductID: z.coerce.number().int().positive(),
        Quantity: z.coerce.number().int().positive(),
        ImportPrice: z.coerce.number().min(0),
        BatchNumber: z
          .string()
          .trim()
          .min(2, 'Số lô sản xuất bắt buộc (tối thiểu 2 ký tự)'),
        ExpiryDate: z
          .string()
          .trim()
          .refine((val) => isValidFutureIsoDate(val), {
            message: 'Hạn sử dụng bắt buộc định dạng YYYY-MM-DD và phải còn hạn (>= hôm nay)',
          }),
      })
    )
    .min(1, 'Phiếu nhập kho phải có ít nhất 1 mặt hàng'),
});

export const getPurchaseOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') {
      where.Status = status;
    }
    if (search) {
      where.OR = [
        { OrderCode: { contains: search } },
        { Note: { contains: search } },
        { supplier: { SupplierName: { contains: search } } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
        orderBy: { CreateDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formatted = orders.map((po) => ({
      POID: po.PurchaseOrderID,
      POCode: po.OrderCode,
      SupplierID: po.SupplierID,
      TotalCost: po.TotalCost,
      Status: po.Status,
      Note: po.Note,
      CreatedBy: 'DS. Nguyễn Văn Trung',
      CreateDate: po.CreateDate,
      supplier: po.supplier,
      items: po.items.map((i) => ({
        POItemID: i.OrderItemID,
        POID: i.PurchaseOrderID,
        ProductID: i.ProductID,
        BatchNumber: i.BatchNumber,
        ExpiryDate: i.ExpiryDate,
        Quantity: i.Quantity,
        ImportPrice: i.ImportPrice,
        product: i.product,
      })),
    }));

    res.json({
      success: true,
      data: formatted,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải lịch sử phiếu nhập kho',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const createPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = purchaseOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        code: 'INVALID_PURCHASE_ORDER',
        message:
          parsed.error.issues[0]?.message ||
          'Dữ liệu phiếu nhập kho không hợp lệ (bắt buộc nhập Số lô & Hạn sử dụng hợp lệ)',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { SupplierID, Note, CreatedBy, items } = parsed.data;
    const actorName = req.user?.FullName || CreatedBy || 'Dược sĩ kho';
    const actorUserId = req.user?.UserID || null;

    const createdOrder = await prisma.$transaction(async (tx) => {
      let totalCost = 0;

      for (const item of items) {
        totalCost += item.Quantity * item.ImportPrice;
      }

      const orderCode = `PNK-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      const po = await tx.purchaseOrder.create({
        data: {
          OrderCode: orderCode,
          SupplierID,
          TotalCost: totalCost,
          Note,
          Status: 'COMPLETED',
          items: {
            create: items,
          },
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      });

      // Tạo lô tồn kho (StockLot FEFO) & bút toán nhập kho (StockMovement IMPORT)
      for (const poItem of po.items) {
        const updatedProduct = await tx.product.update({
          where: { ProductID: poItem.ProductID },
          data: {
            Quantity: { increment: poItem.Quantity },
          },
        });

        await tx.stockLot.create({
          data: {
            ProductID: poItem.ProductID,
            BatchNumber: poItem.BatchNumber,
            ExpiryDate: poItem.ExpiryDate,
            ImportPrice: poItem.ImportPrice,
            InitialQuantity: poItem.Quantity,
            RemainingQuantity: poItem.Quantity,
            Status: 'ACTIVE',
          },
        });

        await tx.stockMovement.create({
          data: {
            ProductID: poItem.ProductID,
            MovementType: 'IMPORT',
            SourceType: 'PURCHASE_ORDER',
            SourceID: po.PurchaseOrderID,
            LineItemID: poItem.OrderItemID,
            Unit: poItem.product?.Unit || 'Hộp',
            Quantity: poItem.Quantity,
            BaseQtyDelta: poItem.Quantity,
            LooseQtyDelta: 0,
            BatchNumber: poItem.BatchNumber,
            ExpiryDate: poItem.ExpiryDate,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Nhập kho theo phiếu ${po.OrderCode} (${poItem.BatchNumber})`,
          },
        });
      }

      return po;
    });

    res.status(201).json({
      success: true,
      message: `Đã lập phiếu nhập kho ${createdOrder.OrderCode}, tạo lô FEFO và cộng tồn kho thành công`,
      data: {
        POID: createdOrder.PurchaseOrderID,
        POCode: createdOrder.OrderCode,
        SupplierID: createdOrder.SupplierID,
        TotalCost: createdOrder.TotalCost,
        Status: createdOrder.Status,
        Note: createdOrder.Note,
        CreatedBy: actorName,
        CreateDate: createdOrder.CreateDate,
        supplier: createdOrder.supplier,
        items: createdOrder.items.map((i) => ({
          POItemID: i.OrderItemID,
          POID: i.PurchaseOrderID,
          ProductID: i.ProductID,
          BatchNumber: i.BatchNumber,
          ExpiryDate: i.ExpiryDate,
          Quantity: i.Quantity,
          ImportPrice: i.ImportPrice,
          product: i.product,
        })),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Không thể tạo phiếu nhập kho',
    });
  }
};

/**
 * HỦY / ĐẢO PHIẾU NHẬP KHO NGUYÊN TỬ (POST /api/enterprise/purchase-orders/:id/cancel) — P0-04
 * Kiểm tra tồn lô chưa bị xuất bán, hoàn giảm Product.Quantity, trừ StockLot và ghi nhận StockMovement.
 */
export const cancelPurchaseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const poId = Number(req.params.id);
    const reason = String(req.body?.reason || '').trim();

    if (!Number.isInteger(poId) || poId <= 0) {
      res.status(400).json({ success: false, message: 'Mã phiếu nhập kho không hợp lệ' });
      return;
    }

    if (reason.length < 5) {
      res.status(400).json({
        success: false,
        code: 'CANCEL_REASON_REQUIRED',
        message: 'Bắt buộc nhập lý do hủy/đảo phiếu nhập kho (tối thiểu 5 ký tự) để lưu vết kiểm toán!',
      });
      return;
    }

    const actorUserId = req.user?.UserID || null;
    const actorName = req.user?.FullName || 'Quản trị viên';

    const cancelledPo = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { PurchaseOrderID: poId },
        include: { items: { include: { product: true } }, supplier: true },
      });

      if (!po) {
        const err: any = new Error('Không tìm thấy phiếu nhập kho');
        err.statusCode = 404;
        throw err;
      }

      if (po.Status === 'CANCELLED') {
        return po;
      }

      for (const item of po.items) {
        const lot = await tx.stockLot.findFirst({
          where: {
            ProductID: item.ProductID,
            BatchNumber: item.BatchNumber,
            Status: 'ACTIVE',
          },
          orderBy: { LotID: 'desc' },
        });

        if (!lot || lot.RemainingQuantity < item.Quantity) {
          const err: any = new Error(
            `Không thể hủy phiếu nhập ${po.OrderCode}: Lô ${item.BatchNumber} của sản phẩm "${item.product?.ProductName || item.ProductID}" đã được xuất bán một phần hoặc toàn bộ!`
          );
          err.statusCode = 422;
          err.code = 'PO_STOCK_ALREADY_CONSUMED';
          throw err;
        }

        const updatedProd = await tx.product.updateMany({
          where: {
            ProductID: item.ProductID,
            Quantity: { gte: item.Quantity },
          },
          data: {
            Quantity: { decrement: item.Quantity },
          },
        });

        if (updatedProd.count === 0) {
          const err: any = new Error(
            `Tồn kho hiện tại của sản phẩm #${item.ProductID} không đủ để đảo phiếu nhập!`
          );
          err.statusCode = 422;
          err.code = 'PO_STOCK_INSUFFICIENT';
          throw err;
        }

        const nextRemaining = lot.RemainingQuantity - item.Quantity;
        await tx.stockLot.update({
          where: { LotID: lot.LotID },
          data: {
            RemainingQuantity: nextRemaining,
            Status: nextRemaining === 0 ? 'CANCELLED' : 'ACTIVE',
          },
        });

        await tx.stockMovement.create({
          data: {
            ProductID: item.ProductID,
            MovementType: 'RETURN_SUPPLIER',
            SourceType: 'PURCHASE_ORDER_CANCEL',
            SourceID: po.PurchaseOrderID,
            LineItemID: item.OrderItemID,
            Unit: item.product?.Unit || 'Hộp',
            Quantity: item.Quantity,
            BaseQtyDelta: -item.Quantity,
            LooseQtyDelta: 0,
            BatchNumber: item.BatchNumber,
            ExpiryDate: item.ExpiryDate,
            ActorUserID: actorUserId,
            ActorName: actorName,
            Note: `Đảo nhập kho phiếu ${po.OrderCode}: ${reason}`,
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { PurchaseOrderID: po.PurchaseOrderID },
        data: {
          Status: 'CANCELLED',
          Note: `${po.Note ? po.Note + ' | ' : ''}[ĐÃ HỦY: ${reason}]`,
        },
        include: { items: { include: { product: true } }, supplier: true },
      });
    });

    res.json({
      success: true,
      message: `Đã hủy/đảo phiếu nhập kho ${cancelledPo.OrderCode} và hoàn giảm tồn kho nguyên tử!`,
      data: {
        POID: cancelledPo.PurchaseOrderID,
        POCode: cancelledPo.OrderCode,
        Status: cancelledPo.Status,
        Note: cancelledPo.Note,
      },
    });
  } catch (error: any) {
    const status = error?.statusCode || 400;
    res.status(status).json({
      success: false,
      code: error?.code || 'PO_CANCEL_FAILED',
      message: error instanceof Error ? error.message : 'Không thể hủy phiếu nhập kho',
    });
  }
};

// ============================================================================
// 4. QUẢN LÝ HỒ SƠ BỆNH NHÂN & TIỀN SỬ DỊ ỨNG THUỐC (/customers) — P0-02, P1-01, P1-05
// ============================================================================
const customerSchema = z.object({
  FullName: z.string().trim().min(2),
  Phone: z.string().trim().min(8),
  Email: z.string().trim().optional().default(''),
  Gender: z.string().trim().optional().default('Khác'),
  BirthYear: z.coerce.number().int().optional(),
  CustomerType: z.enum(['RETAIL', 'WHOLESALE']).optional().default('RETAIL'),
  CompanyName: z.string().trim().optional().default(''),
  TaxCode: z.string().trim().optional().default(''),
  Address: z.string().trim().optional().default(''),
  CreditLimit: z.coerce.number().min(0).optional().default(0),
  Allergies: z.string().trim().optional().default('Không ghi nhận'),
  ChronicCond: z.string().trim().optional().default('Không'),
});

export const getCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const customerType = String(req.query.type || '').trim();
    const callerRole = req.user?.Role || 'CASHIER';
    const isCashier = callerRole === 'CASHIER';

    const where: Record<string, unknown> = {};
    if (customerType === 'RETAIL' || customerType === 'WHOLESALE') {
      where.CustomerType = customerType;
    }
    if (search) {
      where.OR = [
        { FullName: { contains: search } },
        { Phone: { contains: search } },
        { CustomerCode: { contains: search } },
        { CompanyName: { contains: search } },
      ];
    }

    const [total, rawCustomers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: isCashier
          ? undefined
          : {
              invoices: {
                take: 10,
                orderBy: { CreateDate: 'desc' },
                select: {
                  InvoiceID: true,
                  InvoiceCode: true,
                  TotalAmount: true,
                  PaidAmount: true,
                  DebtAmount: true,
                  Status: true,
                  PaymentStatus: true,
                  FulfillmentStatus: true,
                  CreateDate: true,
                },
              },
            },
        orderBy: { CustomerID: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // P1-01: Thu ngân (CASHIER) chỉ được nhận thông tin định danh cơ bản để tích điểm/bán hàng POS,
    // không lộ hồ sơ bệnh án nhạy cảm (Allergies, ChronicCond) hoặc chi tiết hóa đơn của khách.
    const customers = rawCustomers.map((c: any) => {
      if (isCashier) {
        const { Allergies: _a, ChronicCond: _cc, invoices: _inv, ...basicCustomer } = c;
        return {
          ...basicCustomer,
          Allergies: undefined,
          ChronicCond: undefined,
          invoices: [],
        };
      }
      return c;
    });

    res.json({
      success: true,
      data: customers,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách hồ sơ bệnh nhân / đại lý',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    // P0-02: Cấm client truyền trực tiếp DebtBalance khi tạo mới khách hàng
    if (
      req.body &&
      Object.prototype.hasOwnProperty.call(req.body, 'DebtBalance') &&
      Number(req.body.DebtBalance) !== 0
    ) {
      res.status(400).json({
        success: false,
        code: 'DEBT_DIRECT_EDIT_FORBIDDEN',
        message:
          'Không được phép tự gán số dư công nợ (DebtBalance) khi tạo khách hàng! Công nợ chỉ phát sinh qua chứng từ hóa đơn.',
      });
      return;
    }

    const callerRole = req.user?.Role || 'CASHIER';
    const isCashier = callerRole === 'CASHIER';

    // P0-02: CASHIER không được tạo khách hàng WHOLESALE hoặc cấp CreditLimit
    if (
      isCashier &&
      (req.body?.CustomerType === 'WHOLESALE' ||
        (req.body?.CreditLimit !== undefined && Number(req.body.CreditLimit) > 0))
    ) {
      res.status(403).json({
        success: false,
        code: 'CUSTOMER_FINANCIAL_ROLE_REQUIRED',
        message:
          'Thu ngân (CASHIER) chỉ được phép tạo hồ sơ khách lẻ (RETAIL) và không có quyền cấp hạn mức công nợ B2B (CreditLimit)!',
      });
      return;
    }

    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Thông tin khách hàng / đại lý không hợp lệ' });
      return;
    }

    const finalType = isCashier ? 'RETAIL' : parsed.data.CustomerType;
    const finalCreditLimit =
      finalType === 'WHOLESALE'
        ? parsed.data.CreditLimit > 0
          ? parsed.data.CreditLimit
          : 50000000
        : 0;

    const prefix = finalType === 'WHOLESALE' ? 'DL' : 'BN';
    const code = `${prefix}-${String(Date.now()).slice(-4)}`;
    const created = await prisma.customer.create({
      data: {
        CustomerCode: code,
        ...parsed.data,
        CustomerType: finalType,
        CreditLimit: finalCreditLimit,
        DebtBalance: 0,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Số điện thoại đã tồn tại trong hệ thống',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const updateCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã khách hàng không hợp lệ' });
      return;
    }

    // P0-02: Nghiêm cấm sửa trực tiếp DebtBalance qua PUT /customers/:id
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'DebtBalance')) {
      res.status(400).json({
        success: false,
        code: 'DEBT_DIRECT_EDIT_FORBIDDEN',
        message:
          'Nghiêm cấm chỉnh sửa trực tiếp số dư công nợ (DebtBalance)! Công nợ chỉ thay đổi thông qua Hóa đơn bán buôn hoặc Phiếu thu công nợ.',
      });
      return;
    }

    const callerRole = req.user?.Role || 'CASHIER';
    const isCashier = callerRole === 'CASHIER';

    if (
      isCashier &&
      (req.body?.CustomerType !== undefined ||
        req.body?.CreditLimit !== undefined ||
        req.body?.TaxCode !== undefined)
    ) {
      res.status(403).json({
        success: false,
        code: 'CUSTOMER_FINANCIAL_ROLE_REQUIRED',
        message:
          'Thu ngân (CASHIER) không có quyền thay đổi phân loại khách hàng B2B (CustomerType) hoặc hạn mức công nợ (CreditLimit)!',
      });
      return;
    }

    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Dữ liệu cập nhật không hợp lệ' });
      return;
    }

    const updated = await prisma.customer.update({
      where: { CustomerID: id },
      data: parsed.data,
      include: isCashier
        ? undefined
        : {
            invoices: {
              take: 10,
              orderBy: { CreateDate: 'desc' },
            },
          },
    });
    res.json({ success: true, data: updated });
  } catch {
    res.status(400).json({
      success: false,
      message: 'Không thể cập nhật hồ sơ bệnh nhân',
    });
  }
};

// ============================================================================
// 5. SỔ QUỸ THANH TOÁN & ĐỐI SOÁT GIAO DỊCH (/payments) — P1-05, P1-07
// ============================================================================
export const getPaymentsLedger = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const method = String(req.query.method || '').trim();
    const status = String(req.query.status || '').trim();

    const where: Record<string, unknown> = {};
    if (method && method !== 'ALL') {
      where.PaymentMethod = method;
    }
    if (status && status !== 'ALL') {
      where.Status = status;
    }
    if (search) {
      where.OR = [
        { TransactionCode: { contains: search } },
        { invoice: { InvoiceCode: { contains: search } } },
        { invoice: { CustomerName: { contains: search } } },
      ];
    }

    const [total, rawPayments, allPaymentsForSummary] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          invoice: true,
        },
        orderBy: { PaymentDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payment.findMany({
        select: {
          PaymentMethod: true,
          PaidAmount: true,
          Status: true,
          invoice: {
            select: {
              TotalAmount: true,
              PaidAmount: true,
              RefundedAmount: true,
              PaymentStatus: true,
              Status: true,
            },
          },
        },
      }),
    ]);

    const pageInvoiceIds = Array.from(
      new Set(rawPayments.map((p) => p.InvoiceID).filter((id): id is number => Number.isInteger(id)))
    );

    // P1-07: Truy vấn đầy đủ PaymentTransaction theo đúng các InvoiceID trên trang hiện tại
    const rawLedgerTx =
      pageInvoiceIds.length > 0
        ? await prisma.paymentTransaction.findMany({
            where: { InvoiceID: { in: pageInvoiceIds } },
            include: { invoice: true },
            orderBy: { CreateDate: 'desc' },
          })
        : [];

    const payments = rawPayments.map((p) => ({
      ...p,
      Status: p.Status === 'COMPLETED' ? 'PAID' : p.Status,
      transactions: rawLedgerTx.filter((t) => t.InvoiceID === p.InvoiceID),
    }));

    // P1-07: Tổng hợp KPI sổ quỹ toàn hệ thống từ server (không bị lệch bởi phân trang)
    let totalVietQr = 0;
    let totalCashAndCard = 0;
    let totalRefunded = 0;
    let pendingVietQrCount = 0;

    for (const p of allPaymentsForSummary) {
      const normalizedStatus = p.Status === 'COMPLETED' ? 'PAID' : p.Status;
      const refundedAmt = p.invoice?.RefundedAmount || (normalizedStatus === 'REFUNDED' ? p.PaidAmount : 0);
      if (refundedAmt > 0) {
        totalRefunded += refundedAmt;
      }
      if (normalizedStatus === 'UNPAID' || normalizedStatus === 'PENDING') {
        if (p.PaymentMethod === 'VIETQR') {
          pendingVietQrCount += 1;
        }
        continue;
      }
      if (normalizedStatus === 'PAID' || normalizedStatus === 'PARTIALLY_PAID') {
        const netCollected = Math.max(0, (p.PaidAmount || 0) - refundedAmt);
        if (p.PaymentMethod === 'VIETQR') {
          totalVietQr += netCollected;
        } else if (p.PaymentMethod === 'CASH' || p.PaymentMethod === 'CARD') {
          totalCashAndCard += netCollected;
        }
      }
    }

    const totalNet = totalVietQr + totalCashAndCard;

    res.json({
      success: true,
      data: payments,
      transactions: rawLedgerTx,
      summary: {
        totalNet,
        totalVietQr,
        totalCashAndCard,
        totalRefunded,
        pendingVietQrCount,
      },
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải sổ quỹ thanh toán',
    });
  }
};

// ============================================================================
// 6. QUẢN LÝ NHÂN SỰ DƯỢC SĨ & PHÂN QUYỀN (/staff)
// ============================================================================
export const getStaffList = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      select: {
        UserID: true,
        FullName: true,
        Email: true,
        Phone: true,
        Role: true,
        Status: true,
        CreateDate: true,
      },
      orderBy: { UserID: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách nhân sự',
    });
  }
};

export const updateStaffRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'ID nhân sự không hợp lệ' });
      return;
    }
    const { Role, Status } = req.body as { Role?: string; Status?: string };
    const allowedRoles = new Set(['ADMIN', 'PHARMACIST', 'CASHIER']);
    const allowedStatuses = new Set(['ACTIVE', 'INACTIVE']);

    if (Role !== undefined && !allowedRoles.has(Role)) {
      res.status(400).json({ success: false, message: 'Vai trò phân quyền không hợp lệ' });
      return;
    }
    if (Status !== undefined && !allowedStatuses.has(Status)) {
      res.status(400).json({ success: false, message: 'Trạng thái tài khoản không hợp lệ' });
      return;
    }

    const updated = await prisma.user.update({
      where: { UserID: id },
      data: {
        ...(Role ? { Role } : {}),
        ...(Status ? { Status } : {}),
        TokenVersion: { increment: 1 },
      },
      select: {
        UserID: true,
        FullName: true,
        Email: true,
        Phone: true,
        Role: true,
        Status: true,
      },
    });
    res.json({ success: true, data: updated });
  } catch {
    res.status(400).json({
      success: false,
      message: 'Không thể cập nhật phân quyền nhân sự',
    });
  }
};

// ============================================================================
// 7. CÔNG CỤ AI KIỂM TRA TƯƠNG TÁC & QUÁ LIỀU HOẠT CHẤT ĐA THUỐC
// POST /api/enterprise/drug-interactions
// ============================================================================
export const checkDrugInteractions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productIds, patientAllergies = '' } = req.body as {
      productIds: number[];
      patientAllergies?: string;
    };

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ít nhất 1 loại dược phẩm để kiểm tra',
      });
      return;
    }

    const products = await prisma.product.findMany({
      where: { ProductID: { in: productIds.map(Number) } },
    });

    const safetyResult = evaluateDrugSetSafety(products, patientAllergies);

    res.json({
      success: true,
      data: {
        checkedProductsCount: products.length,
        patientAllergies: safetyResult.patientAllergies,
        isSafe: !safetyResult.requiresPharmacistReview,
        hasCriticalAllergy: safetyResult.hasCriticalAllergy,
        hasHighRiskWarning: safetyResult.hasHighRiskWarning,
        requiresPharmacistReview: safetyResult.requiresPharmacistReview,
        isAdvisoryOnly: safetyResult.isAdvisoryOnly,
        disclaimer: safetyResult.disclaimer,
        ruleVersion: safetyResult.ruleVersion,
        warnings: safetyResult.warnings,
      },
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi kiểm tra tương tác thuốc',
    });
  }
};

// ============================================================================
// 8. CẬP NHẬT NHÀ CUNG CẤP & CÁC THAO TÁC CHUẨN 11 CHỨC NĂNG ĐA BẢNG
// (Xóa đơn/hàng loạt, Nhân bản đơn/hàng loạt, Export/Import .xlsx/.json/.xml)
// ============================================================================
export const updateSupplier = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const parsed = supplierSchema.partial().safeParse(req.body);
    if (!parsed.success || isNaN(id)) {
      res.status(400).json({ success: false, message: 'Dữ liệu nhà cung cấp không hợp lệ' });
      return;
    }
    const updated = await prisma.supplier.update({
      where: { SupplierID: id },
      data: parsed.data,
    });
    res.json({ success: true, data: updated });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể cập nhật nhà cung cấp' });
  }
};

const NON_DELETABLE_LEDGER_ENTITIES = new Set([
  'invoices',
  'payments',
  'purchase-orders',
  'payment-transactions',
  'stock-movements',
]);

export const deleteEntityRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = String(req.params.entity || '').trim().toLowerCase();

    // P0-04: Nghiêm cấm xóa cứng (DELETE) chứng từ kế toán / kho đã ghi sổ
    if (NON_DELETABLE_LEDGER_ENTITIES.has(entity)) {
      res.status(403).json({
        success: false,
        code: 'LEDGER_HARD_DELETE_FORBIDDEN',
        message:
          'Nghiêm cấm xóa cứng chứng từ kế toán/kho đã ghi sổ (Hóa đơn, Sổ quỹ, Phiếu nhập kho). Vui lòng sử dụng nghiệp vụ Hủy/Đảo chứng từ (Cancel/Reverse) để bảo toàn dấu vết kiểm toán!',
      });
      return;
    }

    const rawIds: number[] = Array.isArray(req.body?.ids)
      ? req.body.ids.map(Number)
      : req.params.id
      ? [Number(req.params.id)]
      : [];

    if (rawIds.length === 0) {
      res.status(400).json({ success: false, message: 'Chưa chọn bản ghi cần xóa' });
      return;
    }

    let deletedCount = 0;
    if (entity === 'suppliers') {
      const r = await prisma.supplier.deleteMany({ where: { SupplierID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'customers') {
      const r = await prisma.customer.deleteMany({ where: { CustomerID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'contacts') {
      const r = await prisma.contact.deleteMany({ where: { ContactID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'staff') {
      const r = await prisma.user.deleteMany({ where: { UserID: { in: rawIds } } });
      deletedCount = r.count;
    } else {
      res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_DELETE_ENTITY',
        message: `Không hỗ trợ xóa thực thể "${entity}"`,
      });
      return;
    }

    res.json({ success: true, data: { deletedCount } });
  } catch {
    res.status(400).json({
      success: false,
      message: 'Bản ghi đang có chứng từ liên kết ràng buộc, không thể xóa trực tiếp',
    });
  }
};

export const cloneEntityRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = req.params.entity;
    const rawIds: number[] = Array.isArray(req.body?.ids)
      ? req.body.ids.map(Number)
      : req.params.id
      ? [Number(req.params.id)]
      : [];

    if (rawIds.length === 0) {
      res.status(400).json({ success: false, message: 'Chưa chọn bản ghi để nhân bản' });
      return;
    }

    let clonedCount = 0;
    const suffix = () => String(Math.floor(1000 + Math.random() * 9000));

    if (entity === 'suppliers') {
      const list = await prisma.supplier.findMany({ where: { SupplierID: { in: rawIds } } });
      for (const item of list) {
        await prisma.supplier.create({
          data: {
            SupplierCode: `${item.SupplierCode}-C${suffix()}`,
            SupplierName: `${item.SupplierName} (Bản sao)`,
            ContactPerson: item.ContactPerson,
            Phone: item.Phone,
            Email: item.Email,
            Address: item.Address,
            TaxCode: item.TaxCode,
          },
        });
        clonedCount++;
      }
    } else if (entity === 'customers') {
      const list = await prisma.customer.findMany({ where: { CustomerID: { in: rawIds } } });
      for (const item of list) {
        await prisma.customer.create({
          data: {
            CustomerCode: `BN-${suffix()}`,
            FullName: `${item.FullName} (Bản sao)`,
            Phone: `${item.Phone.slice(0, 7)}${suffix().slice(0, 3)}`,
            Email: item.Email,
            Gender: item.Gender,
            BirthYear: item.BirthYear,
            Allergies: item.Allergies,
            ChronicCond: item.ChronicCond,
            LoyaltyPoints: item.LoyaltyPoints,
          },
        });
        clonedCount++;
      }
    } else if (entity === 'contacts') {
      const list = await prisma.contact.findMany({ where: { ContactID: { in: rawIds } } });
      for (const item of list) {
        await prisma.contact.create({
          data: {
            FullName: item.FullName,
            Email: item.Email,
            Phone: item.Phone,
            Subject: `${item.Subject} (Bản sao)`,
            Message: item.Message,
            ReplyNote: item.ReplyNote,
            Status: item.Status,
          },
        });
        clonedCount++;
      }
    } else if (entity === 'staff') {
      const list = await prisma.user.findMany({ where: { UserID: { in: rawIds } } });
      for (const item of list) {
        await prisma.user.create({
          data: {
            FullName: `${item.FullName} (Bản sao)`,
            Email: `copy.${suffix()}.${item.Email}`,
            Password: item.Password,
            Phone: item.Phone,
            Role: item.Role,
            Status: item.Status,
          },
        });
        clonedCount++;
      }
    } else if (entity === 'purchase-orders') {
      const list = await prisma.purchaseOrder.findMany({
        where: { PurchaseOrderID: { in: rawIds } },
        include: { items: true },
      });
      for (const po of list) {
        await prisma.purchaseOrder.create({
          data: {
            OrderCode: `PNK-COPY-${suffix()}`,
            SupplierID: po.SupplierID,
            TotalCost: po.TotalCost,
            Note: `${po.Note || ''} (Bản sao)`,
            Status: po.Status,
            items: {
              create: po.items.map((i) => ({
                ProductID: i.ProductID,
                Quantity: i.Quantity,
                ImportPrice: i.ImportPrice,
                BatchNumber: i.BatchNumber,
                ExpiryDate: i.ExpiryDate,
              })),
            },
          },
        });
        clonedCount++;
      }
    } else if (entity === 'invoices') {
      const list = await prisma.invoice.findMany({
        where: { InvoiceID: { in: rawIds } },
        include: { items: true, payment: true },
      });
      for (const inv of list) {
        await prisma.invoice.create({
          data: {
            InvoiceCode: `HD-COPY-${suffix()}`,
            CustomerName: `${inv.CustomerName} (Bản sao)`,
            CustomerPhone: inv.CustomerPhone,
            CustomerID: inv.CustomerID,
            Discount: inv.Discount,
            Note: inv.Note,
            TotalAmount: inv.TotalAmount,
            Status: inv.Status,
            items: {
              create: inv.items.map((i) => ({
                ProductID: i.ProductID,
                Quantity: i.Quantity,
                UnitPrice: i.UnitPrice,
                DosageNote: i.DosageNote,
              })),
            },
            ...(inv.payment
              ? {
                  payment: {
                    create: {
                      PaymentMethod: inv.payment.PaymentMethod,
                      TransactionCode: `COPY-${suffix()}`,
                      PaidAmount: inv.payment.PaidAmount,
                      Status: inv.payment.Status,
                    },
                  },
                }
              : {}),
          },
        });
        clonedCount++;
      }
    }

    res.json({ success: true, data: { clonedCount } });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể nhân bản bản ghi đã chọn' });
  }
};

export const exportEntityData = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = req.params.entity;
    const format = String(req.query.format || 'xlsx').toLowerCase();

    let rows: Record<string, unknown>[] = [];
    if (entity === 'suppliers') {
      rows = (await prisma.supplier.findMany({ orderBy: { SupplierID: 'desc' } })) as unknown as Record<string, unknown>[];
    } else if (entity === 'purchase-orders') {
      const list = await prisma.purchaseOrder.findMany({
        include: { supplier: true },
        orderBy: { PurchaseOrderID: 'desc' },
      });
      rows = list.map((po) => ({
        POCode: po.OrderCode,
        SupplierName: po.supplier.SupplierName,
        TotalCost: po.TotalCost,
        Status: po.Status,
        Note: po.Note,
        CreateDate: po.CreateDate.toISOString(),
      }));
    } else if (entity === 'customers') {
      rows = (await prisma.customer.findMany({ orderBy: { CustomerID: 'desc' } })) as unknown as Record<string, unknown>[];
    } else if (entity === 'invoices') {
      const list = await prisma.invoice.findMany({
        include: { payment: true },
        orderBy: { InvoiceID: 'desc' },
      });
      rows = list.map((inv) => ({
        InvoiceID: inv.InvoiceID,
        InvoiceCode: inv.InvoiceCode,
        CustomerName: inv.CustomerName,
        CustomerPhone: inv.CustomerPhone,
        Discount: inv.Discount,
        TotalAmount: inv.TotalAmount,
        PaymentMethod: inv.payment?.PaymentMethod || 'CASH',
        Status: inv.Status,
        CreateDate: inv.CreateDate.toISOString(),
      }));
    } else if (entity === 'payments') {
      const list = await prisma.payment.findMany({
        include: { invoice: true },
        orderBy: { PaymentID: 'desc' },
      });
      rows = list.map((p) => ({
        PaymentID: p.PaymentID,
        TransactionCode: p.TransactionCode,
        InvoiceCode: p.invoice?.InvoiceCode || '',
        CustomerName: p.invoice?.CustomerName || '',
        PaymentMethod: p.PaymentMethod,
        PaidAmount: p.PaidAmount,
        Status: p.Status,
        PaymentDate: p.PaymentDate.toISOString(),
      }));
    } else if (entity === 'contacts') {
      rows = (await prisma.contact.findMany({ orderBy: { ContactID: 'desc' } })) as unknown as Record<string, unknown>[];
    } else if (entity === 'staff') {
      const list = await prisma.user.findMany({ orderBy: { UserID: 'asc' } });
      rows = list.map((u) => ({
        UserID: u.UserID,
        FullName: u.FullName,
        Email: u.Email,
        Phone: u.Phone,
        Role: u.Role,
        Status: u.Status,
        CreateDate: u.CreateDate.toISOString(),
      }));
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pharmacore_${entity}.json"`);
      res.send(JSON.stringify(rows, null, 2));
      return;
    }

    if (format === 'xml') {
      const builder = new XMLBuilder({ format: true, ignoreAttributes: false, indentBy: '  ' });
      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        builder.build({ Records: { Record: rows } });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pharmacore_${entity}.xml"`);
      res.send(xml);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Data_${entity}`);
    const keys = rows.length > 0 ? Object.keys(rows[0]) : ['ID', 'Name'];
    sheet.columns = keys.map((k) => ({ header: k, key: k, width: 24 }));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF18181B' },
    };
    for (const r of rows) {
      const clean: Record<string, unknown> = {};
      for (const k of keys) {
        const val = r[k];
        clean[k] = val instanceof Date ? val.toISOString() : val ?? '';
      }
      sheet.addRow(clean);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="pharmacore_${entity}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).json({ success: false, message: 'Không thể xuất dữ liệu tệp' });
  }
};

const SUPPORTED_IMPORT_ENTITIES = new Set(['suppliers', 'customers', 'contacts']);
const MAX_IMPORT_ROWS = 500;

const importSupplierRowSchema = z.object({
  SupplierCode: z.string().trim().min(2).optional(),
  SupplierName: z.string().trim().min(2, 'Tên nhà cung cấp bắt buộc (tối thiểu 2 ký tự)'),
  ContactPerson: z.string().trim().optional().default('Phòng Kinh doanh'),
  Phone: z.string().trim().min(8, 'Số điện thoại nhà cung cấp bắt buộc (tối thiểu 8 ký tự)'),
  Email: z.string().trim().optional().default(''),
  Address: z.string().trim().optional().default('Việt Nam'),
  TaxCode: z.string().trim().optional().default(''),
});

const importCustomerRowSchema = z.object({
  FullName: z.string().trim().min(2, 'Họ tên khách hàng bắt buộc (tối thiểu 2 ký tự)'),
  Phone: z.string().trim().min(8, 'Số điện thoại khách hàng bắt buộc (tối thiểu 8 ký tự)'),
  Email: z.string().trim().optional().default(''),
  Gender: z.string().trim().optional().default('Khác'),
  BirthYear: z.coerce.number().int().min(1900).max(2100).optional(),
  CustomerType: z.enum(['RETAIL', 'WHOLESALE']).optional().default('RETAIL'),
  CompanyName: z.string().trim().optional().default(''),
  TaxCode: z.string().trim().optional().default(''),
  Address: z.string().trim().optional().default(''),
  CreditLimit: z.coerce.number().min(0).optional().default(0),
  Allergies: z.string().trim().optional().default('Không ghi nhận'),
  ChronicCond: z.string().trim().optional().default('Không'),
});

const importContactRowSchema = z.object({
  FullName: z.string().trim().min(2, 'Họ tên người gửi bắt buộc'),
  Email: z.string().trim().min(3, 'Email liên hệ bắt buộc'),
  Phone: z.string().trim().min(8, 'Số điện thoại liên hệ bắt buộc'),
  Subject: z.string().trim().min(2, 'Tiêu đề tư vấn bắt buộc'),
  Message: z.string().trim().min(3, 'Nội dung câu hỏi bắt buộc'),
});

export const importEntityData = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = String(req.params.entity || '').trim().toLowerCase();

    // P1-06: Kiểm tra allowlist entity trước khi đọc file; trả HTTP 400 nếu không hỗ trợ
    if (!SUPPORTED_IMPORT_ENTITIES.has(entity)) {
      res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_IMPORT_ENTITY',
        message: `Thực thể "${entity}" không hỗ trợ nhập từ tệp (Chỉ hỗ trợ: suppliers, customers, contacts).`,
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Vui lòng chọn tệp dữ liệu để nhập' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.json', '.xml', '.xlsx'].includes(ext)) {
      res.status(400).json({
        success: false,
        code: 'UNSUPPORTED_IMPORT_FORMAT',
        message: 'Định dạng tệp không hợp lệ (chỉ chấp nhận .xlsx, .json, .xml).',
      });
      return;
    }

    let rawRecords: Record<string, unknown>[] = [];

    if (ext === '.json') {
      const parsed = JSON.parse(file.buffer.toString('utf-8'));
      rawRecords = Array.isArray(parsed) ? parsed : parsed.items || [parsed];
    } else if (ext === '.xml') {
      const parser = new XMLParser({ ignoreAttributes: false });
      const parsed = parser.parse(file.buffer.toString('utf-8'));
      const node = parsed?.Records?.Record ?? parsed?.Products?.Product ?? [];
      rawRecords = Array.isArray(node) ? node : [node];
    } else if (ext === '.xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.worksheets[0];
      if (sheet) {
        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, col) => {
          headers[col] = String(cell.value || '').trim();
        });
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const obj: Record<string, unknown> = {};
          row.eachCell((cell, col) => {
            if (headers[col]) obj[headers[col]] = cell.value;
          });
          if (Object.keys(obj).length > 0) rawRecords.push(obj);
        });
      }
    }

    if (rawRecords.length === 0) {
      res.status(400).json({
        success: false,
        code: 'EMPTY_IMPORT_DATA',
        message: 'Tệp dữ liệu không có dòng bản ghi nào để nhập.',
      });
      return;
    }

    if (rawRecords.length > MAX_IMPORT_ROWS) {
      res.status(400).json({
        success: false,
        code: 'IMPORT_ROW_LIMIT_EXCEEDED',
        message: `Số lượng bản ghi vượt quá giới hạn an toàn (${rawRecords.length} > ${MAX_IMPORT_ROWS} dòng/lần).`,
      });
      return;
    }

    // P1-06: Validate toàn bộ dòng bằng Zod schema trước khi mở transaction, không tự bịa SĐT/email giả
    const validatedRows: any[] = [];
    for (let idx = 0; idx < rawRecords.length; idx++) {
      const r = rawRecords[idx];
      if (entity === 'suppliers') {
        const v = importSupplierRowSchema.safeParse(r);
        if (!v.success) {
          res.status(400).json({
            success: false,
            code: 'INVALID_IMPORT_ROW',
            message: `Dòng ${idx + 1} không hợp lệ: ${v.error.issues[0]?.message || 'Thiếu trường bắt buộc'}`,
          });
          return;
        }
        validatedRows.push(v.data);
      } else if (entity === 'customers') {
        if (Object.prototype.hasOwnProperty.call(r, 'DebtBalance') && Number(r.DebtBalance) !== 0) {
          res.status(400).json({
            success: false,
            code: 'DEBT_DIRECT_EDIT_FORBIDDEN',
            message: `Dòng ${idx + 1}: Không được phép import số dư công nợ (DebtBalance) trực tiếp!`,
          });
          return;
        }
        const v = importCustomerRowSchema.safeParse(r);
        if (!v.success) {
          res.status(400).json({
            success: false,
            code: 'INVALID_IMPORT_ROW',
            message: `Dòng ${idx + 1} không hợp lệ: ${v.error.issues[0]?.message || 'Thiếu Họ tên hoặc SĐT hợp lệ'}`,
          });
          return;
        }
        validatedRows.push(v.data);
      } else if (entity === 'contacts') {
        const v = importContactRowSchema.safeParse(r);
        if (!v.success) {
          res.status(400).json({
            success: false,
            code: 'INVALID_IMPORT_ROW',
            message: `Dòng ${idx + 1} không hợp lệ: ${v.error.issues[0]?.message || 'Thiếu thông tin liên hệ bắt buộc'}`,
          });
          return;
        }
        validatedRows.push(v.data);
      }
    }

    const importedCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (let i = 0; i < validatedRows.length; i++) {
        const row = validatedRows[i];
        const codeSuffix = `${String(Date.now()).slice(-4)}${String(i + 1).padStart(2, '0')}`;
        if (entity === 'suppliers') {
          await tx.supplier.create({
            data: {
              SupplierCode: row.SupplierCode || `NCC-${codeSuffix}`,
              SupplierName: row.SupplierName,
              ContactPerson: row.ContactPerson,
              Phone: row.Phone,
              Email: row.Email,
              Address: row.Address,
              TaxCode: row.TaxCode,
            },
          });
          count++;
        } else if (entity === 'customers') {
          const prefix = row.CustomerType === 'WHOLESALE' ? 'DL' : 'BN';
          await tx.customer.create({
            data: {
              CustomerCode: `${prefix}-${codeSuffix}`,
              FullName: row.FullName,
              Phone: row.Phone,
              Email: row.Email,
              Gender: row.Gender,
              BirthYear: row.BirthYear,
              CustomerType: row.CustomerType,
              CompanyName: row.CompanyName,
              TaxCode: row.TaxCode,
              Address: row.Address,
              CreditLimit: row.CustomerType === 'WHOLESALE' ? row.CreditLimit || 50000000 : 0,
              DebtBalance: 0,
              Allergies: row.Allergies,
              ChronicCond: row.ChronicCond,
            },
          });
          count++;
        } else if (entity === 'contacts') {
          await tx.contact.create({
            data: {
              FullName: row.FullName,
              Email: row.Email,
              Phone: row.Phone,
              Subject: row.Subject,
              Message: row.Message,
            },
          });
          count++;
        }
      }
      return count;
    });

    res.json({ success: true, data: { importedCount } });
  } catch (error) {
    res.status(400).json({
      success: false,
      code: 'IMPORT_FAILED',
      message:
        error instanceof Error
          ? `Không thể nhập dữ liệu từ tệp: ${error.message}`
          : 'Không thể nhập dữ liệu từ tệp',
    });
  }
};
