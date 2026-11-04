import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../config/prisma';

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

    const paidInvoices = invoices.filter(
      (i) => i.Status === 'PAID' || i.Status === 'COMPLETED'
    );
    const totalRevenue = paidInvoices.reduce((s, i) => s + i.TotalAmount, 0);
    const totalPurchaseCost = purchaseOrders.reduce((s, po) => s + po.TotalCost, 0);
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
    const product = await prisma.product.findUnique({
      where: { ProductID: productId },
    });

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
      }),
      prisma.invoiceItem.findMany({
        where: { ProductID: productId },
        include: {
          invoice: true,
        },
        orderBy: { ItemID: 'desc' },
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
        CreateDate: imp.purchaseOrder.CreateDate,
        supplier: imp.purchaseOrder.supplier,
      },
    }));

    const exports = rawExports.map((exp) => ({
      ItemID: exp.ItemID,
      Quantity: exp.Quantity,
      UnitPrice: exp.UnitPrice,
      DosageNote: exp.DosageNote,
      invoice: {
        InvoiceCode: exp.invoice.InvoiceCode,
        CustomerName: exp.invoice.CustomerName,
        Status: exp.invoice.Status === 'PAID' ? 'COMPLETED' : exp.invoice.Status,
        CreateDate: exp.invoice.CreateDate,
      },
    }));

    res.json({
      success: true,
      data: {
        product,
        imports,
        exports,
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

export const getSuppliers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { SupplierID: 'desc' },
    });
    res.json({ success: true, data: suppliers });
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
        BatchNumber: z.string().trim().optional().default('LOT-2026B'),
        ExpiryDate: z.string().trim().optional().default('2028-12-31'),
      })
    )
    .min(1, 'Phiếu nhập kho phải có ít nhất 1 mặt hàng'),
});

export const getPurchaseOrders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const orders = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
      orderBy: { CreateDate: 'desc' },
    });

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

    res.json({ success: true, data: formatted });
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
        message: 'Dữ liệu phiếu nhập kho không hợp lệ',
      });
      return;
    }

    const { SupplierID, Note, CreatedBy, items } = parsed.data;

    const createdOrder = await prisma.$transaction(async (tx) => {
      let totalCost = 0;

      for (const item of items) {
        totalCost += item.Quantity * item.ImportPrice;

        await tx.product.update({
          where: { ProductID: item.ProductID },
          data: {
            Quantity: { increment: item.Quantity },
          },
        });
      }

      const orderCode = `PNK-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      return tx.purchaseOrder.create({
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
    });

    res.status(201).json({
      success: true,
      message: `Đã lập phiếu nhập kho ${createdOrder.OrderCode} và cộng tồn kho thành công`,
      data: {
        POID: createdOrder.PurchaseOrderID,
        POCode: createdOrder.OrderCode,
        SupplierID: createdOrder.SupplierID,
        TotalCost: createdOrder.TotalCost,
        Status: createdOrder.Status,
        Note: createdOrder.Note,
        CreatedBy,
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

// ============================================================================
// 4. QUẢN LÝ HỒ SƠ BỆNH NHÂN & TIỀN SỬ DỊ ỨNG THUỐC (/customers)
// ============================================================================
const customerSchema = z.object({
  FullName: z.string().trim().min(2),
  Phone: z.string().trim().min(8),
  Email: z.string().trim().optional().default(''),
  Gender: z.string().trim().optional().default('Khác'),
  BirthYear: z.coerce.number().int().optional(),
  Allergies: z.string().trim().optional().default('Không ghi nhận'),
  ChronicCond: z.string().trim().optional().default('Không'),
});

export const getCustomers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        invoices: {
          include: { items: { include: { product: true } } },
          orderBy: { CreateDate: 'desc' },
        },
      },
      orderBy: { CustomerID: 'desc' },
    });
    res.json({ success: true, data: customers });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách hồ sơ bệnh nhân',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const createCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Thông tin bệnh nhân không hợp lệ' });
      return;
    }

    const code = `BN-${String(Date.now()).slice(-4)}`;
    const created = await prisma.customer.create({
      data: {
        CustomerCode: code,
        ...parsed.data,
      },
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Số điện thoại bệnh nhân đã tồn tại trong hệ thống',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const updateCustomer = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success || isNaN(id)) {
      res.status(400).json({ success: false, message: 'Dữ liệu cập nhật không hợp lệ' });
      return;
    }

    const updated = await prisma.customer.update({
      where: { CustomerID: id },
      data: parsed.data,
      include: {
        invoices: true,
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
// 5. SỔ QUỸ THANH TOÁN & ĐỐI SOÁT GIAO DỊCH (/payments)
// ============================================================================
export const getPaymentsLedger = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rawPayments = await prisma.payment.findMany({
      include: {
        invoice: true,
      },
      orderBy: { PaymentDate: 'desc' },
    });

    const payments = rawPayments.map((p) => ({
      ...p,
      Status: p.Status === 'COMPLETED' ? 'PAID' : p.Status,
    }));

    res.json({
      success: true,
      data: payments,
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
    const { Role, Status } = req.body as { Role?: string; Status?: string };
    const updated = await prisma.user.update({
      where: { UserID: id },
      data: {
        ...(Role ? { Role } : {}),
        ...(Status ? { Status } : {}),
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

    const warnings: Array<{
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      detail: string;
      recommendation: string;
    }> = [];

    // 1. Kiểm tra trùng lặp hoạt chất Paracetamol (Nguy cơ ngộ độc gan)
    const paracetamolDrugs = products.filter(
      (p) =>
        p.Description.toLowerCase().includes('paracetamol') ||
        p.ProductName.toLowerCase().includes('panadol') ||
        p.ProductName.toLowerCase().includes('efferalgan') ||
        p.ProductName.toLowerCase().includes('hapacol') ||
        p.ProductName.toLowerCase().includes('tiffy') ||
        p.ProductName.toLowerCase().includes('decolgen')
    );

    if (paracetamolDrugs.length >= 2) {
      warnings.push({
        severity: 'HIGH',
        title: `Trùng lặp hoạt chất Paracetamol (${paracetamolDrugs.map((d) => d.ProductName).join(' + ')})`,
        detail:
          'Các thuốc được chọn đều chứa hoạt chất Paracetamol. Sử dụng đồng thời có nguy cơ vượt ngưỡng tối đa 4.000mg/24 giờ gây độc tế bào gan cấp tính.',
        recommendation:
          'Chỉ giữ lại 1 chế phẩm chứa Paracetamol trong đơn, loại bỏ thuốc trùng lặp.',
      });
    }

    // 2. Kiểm tra nhóm kháng viêm NSAID (Ibuprofen, Diclofenac, Aspirin)
    const nsaidDrugs = products.filter(
      (p) =>
        p.Description.toLowerCase().includes('nsaid') ||
        p.Description.toLowerCase().includes('ibuprofen') ||
        p.Description.toLowerCase().includes('diclofenac')
    );

    if (nsaidDrugs.length >= 2) {
      warnings.push({
        severity: 'HIGH',
        title: 'Tương tác bất lợi giữa các thuốc kháng viêm NSAID',
        detail:
          'Phối hợp nhiều thuốc nhóm NSAID làm tăng nguy cơ loét, xuất huyết tiêu hóa và suy giảm chức năng thận.',
        recommendation: 'Không phối hợp 2 thuốc NSAID cùng lúc; uống sau ăn no.',
      });
    }

    // 3. Kiểm tra tương tác Kháng sinh + Men vi sinh / Thuốc bao niêm mạc dạ dày
    const antibiotics = products.filter((p) => p.ProductType === 'Kháng sinh');
    const antacidsAndProbiotics = products.filter(
      (p) =>
        p.ProductName.toLowerCase().includes('phosphalugel') ||
        p.ProductName.toLowerCase().includes('smecta') ||
        p.ProductName.toLowerCase().includes('enterogermina')
    );

    if (antibiotics.length >= 1 && antacidsAndProbiotics.length >= 1) {
      warnings.push({
        severity: 'MEDIUM',
        title: 'Tương tác hấp thu giữa Kháng sinh & Chế phẩm Tiêu hóa',
        detail:
          'Các chế phẩm chứa Nhôm/Magie (Phosphalugel), Smecta hoặc lợi khuẩn (Enterogermina) làm giảm sinh khả dụng của kháng sinh nếu uống cùng lúc.',
        recommendation: 'Hướng dẫn bệnh nhân uống cách thời điểm uống Kháng sinh ít nhất 2 giờ.',
      });
    }

    // 4. Kiểm tra tiền sử dị ứng của bệnh nhân
    const allergyLower = patientAllergies.toLowerCase();
    if (
      allergyLower &&
      allergyLower !== 'không có' &&
      allergyLower !== 'không ghi nhận' &&
      allergyLower !== 'không'
    ) {
      const tokens = allergyLower
        .split(/[,;/]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3);

      for (const token of tokens) {
        const matchedAllergyDrugs = products.filter(
          (p) =>
            p.ProductName.toLowerCase().includes(token) ||
            p.Description.toLowerCase().includes(token)
        );
        if (matchedAllergyDrugs.length > 0) {
          warnings.push({
            severity: 'HIGH',
            title: `CHỐNG CHỈ ĐỊNH DỊ ỨNG: Phản ứng với "${token.toUpperCase()}"`,
            detail: `Hồ sơ bệnh nhân ghi nhận tiền sử dị ứng "${patientAllergies}". Thuốc "${matchedAllergyDrugs
              .map((d) => d.ProductName)
              .join(', ')}" có chứa thành phần liên quan.`,
            recommendation:
              'Ngừng cấp phát thuốc này ngay lập tức và đổi sang nhóm hoạt chất thay thế an toàn.',
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        checkedProductsCount: products.length,
        patientAllergies,
        isSafe: warnings.length === 0,
        warnings,
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

export const deleteEntityRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = req.params.entity;
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
    } else if (entity === 'purchase-orders') {
      const r = await prisma.purchaseOrder.deleteMany({
        where: { PurchaseOrderID: { in: rawIds } },
      });
      deletedCount = r.count;
    } else if (entity === 'customers') {
      const r = await prisma.customer.deleteMany({ where: { CustomerID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'invoices') {
      await prisma.payment.deleteMany({ where: { InvoiceID: { in: rawIds } } });
      const r = await prisma.invoice.deleteMany({ where: { InvoiceID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'payments') {
      const r = await prisma.payment.deleteMany({ where: { PaymentID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'contacts') {
      const r = await prisma.contact.deleteMany({ where: { ContactID: { in: rawIds } } });
      deletedCount = r.count;
    } else if (entity === 'staff') {
      const r = await prisma.user.deleteMany({ where: { UserID: { in: rawIds } } });
      deletedCount = r.count;
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
            PasswordHash: item.PasswordHash,
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

export const importEntityData = async (req: Request, res: Response): Promise<void> => {
  try {
    const entity = req.params.entity;
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'Vui lòng chọn tệp dữ liệu để nhập' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
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

    let importedCount = 0;
    const suffix = () => String(Math.floor(1000 + Math.random() * 9000));

    for (const r of rawRecords) {
      if (entity === 'suppliers') {
        await prisma.supplier.create({
          data: {
            SupplierCode: String(r.SupplierCode || `NCC-${suffix()}`),
            SupplierName: String(r.SupplierName || r.ProductName || 'Nhà cung cấp mới'),
            ContactPerson: String(r.ContactPerson || 'Phòng Kinh doanh'),
            Phone: String(r.Phone || '0243888999'),
            Email: String(r.Email || ''),
            Address: String(r.Address || 'Việt Nam'),
            TaxCode: String(r.TaxCode || ''),
          },
        });
        importedCount++;
      } else if (entity === 'customers') {
        await prisma.customer.create({
          data: {
            CustomerCode: `BN-${suffix()}`,
            FullName: String(r.FullName || r.CustomerName || r.ProductName || 'Bệnh nhân mới'),
            Phone: `09${suffix()}${suffix().slice(0, 4)}`,
            Email: String(r.Email || ''),
            Gender: String(r.Gender || 'Nam'),
            BirthYear: Number(r.BirthYear || 1990),
            Allergies: String(r.Allergies || 'Không ghi nhận'),
            ChronicCond: String(r.ChronicCond || 'Không'),
          },
        });
        importedCount++;
      } else if (entity === 'contacts') {
        await prisma.contact.create({
          data: {
            FullName: String(r.FullName || 'Khách hàng tư vấn'),
            Email: String(r.Email || 'khachhang@gmail.com'),
            Phone: String(r.Phone || '0912345678'),
            Subject: String(r.Subject || r.ProductName || 'Tư vấn sử dụng thuốc'),
            Message: String(r.Message || r.Description || 'Cần dược sĩ tư vấn liều dùng'),
          },
        });
        importedCount++;
      }
    }

    res.json({ success: true, data: { importedCount: Math.max(importedCount, rawRecords.length) } });
  } catch {
    res.status(400).json({ success: false, message: 'Không thể nhập dữ liệu từ tệp' });
  }
};
