import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { z } from 'zod';

// Schema kiểm tra dữ liệu đầu vào chuẩn 10 trường của bảng Product
export const productSchema = z.object({
  ProductName: z.string().min(2, 'Tên thuốc phải có ít nhất 2 ký tự'),
  PathImage: z.string().optional().default('https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80'),
  ProductType: z.string().min(1, 'Vui lòng chọn nhóm thuốc'),
  Quantity: z.coerce.number().int().min(0, 'Số lượng không được âm'),
  Unit: z.string().min(1, 'Vui lòng nhập đơn vị tính (Hộp, Vỉ, Viên, Chai...)'),
  Price: z.coerce.number().min(0, 'Đơn giá không được âm'),
  Description: z.string().optional().default(''),
});

/**
 * 1. HIỂN THỊ BẢNG PHÂN TRANG (10 - 15 item/page) & TÌM KIẾM CƠ BẢN (Yêu cầu #1 & #6)
 * GET /api/products?page=1&limit=10&search=...&type=...&unit=...
 */
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10)); // Mặc định 10 item/page theo đề bài
    const search = String(req.query.search || '').trim();
    const productType = String(req.query.type || '').trim();
    const unit = String(req.query.unit || '').trim();
    const sortBy = String(req.query.sortBy || 'ProductID');
    const sortOrder = String(req.query.sortOrder || 'desc') === 'asc' ? 'asc' : 'desc';

    const whereClause: any = {};

    if (productType && productType !== 'ALL') {
      whereClause.ProductType = productType;
    }

    if (unit && unit !== 'ALL') {
      whereClause.Unit = unit;
    }

    if (search) {
      const numericId = Number(search);
      whereClause.OR = [
        { ProductName: { contains: search } },
        { Description: { contains: search } },
        { ProductType: { contains: search } },
        ...(Number.isInteger(numericId) && numericId > 0 ? [{ ProductID: numericId }] : []),
      ];
    }

    const [total, items, allTypes, allUnits] = await Promise.all([
      prisma.product.count({ where: whereClause }),
      prisma.product.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.product.findMany({ select: { ProductType: true }, distinct: ['ProductType'] }),
      prisma.product.findMany({ select: { Unit: true }, distinct: ['Unit'] }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          types: allTypes.map((t) => t.ProductType),
          units: allUnits.map((u) => u.Unit),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách sản phẩm thuốc',
      error: error.message,
    });
  }
};

/**
 * 4. XEM CHI TIẾT SẢN PHẨM (Yêu cầu #4)
 * GET /api/products/:id
 */
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Mã thuốc (ProductID) không hợp lệ' });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { ProductID: id },
    });

    if (!product) {
      res.status(404).json({ success: false, message: `Không tìm thấy thuốc có mã #${id}` });
      return;
    }

    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Lỗi khi xem chi tiết thuốc', error: error.message });
  }
};

/**
 * 2. THÊM MỚI SẢN PHẨM (Yêu cầu #2)
 * POST /api/products
 */
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu đầu vào không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const created = await prisma.product.create({
      data: parsed.data,
    });

    res.status(201).json({
      success: true,
      message: 'Thêm mới sản phẩm thuốc thành công',
      data: created,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Lỗi khi thêm mới thuốc', error: error.message });
  }
};

/**
 * 3. CẬP NHẬT SẢN PHẨM (Yêu cầu #3)
 * PUT /api/products/:id
 */
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: 'Mã thuốc không hợp lệ' });
      return;
    }

    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu cập nhật không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const updated = await prisma.product.update({
      where: { ProductID: id },
      data: parsed.data,
    });

    res.json({
      success: true,
      message: `Cập nhật thuốc #${id} thành công`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Lỗi khi cập nhật thuốc', error: error.message });
  }
};
