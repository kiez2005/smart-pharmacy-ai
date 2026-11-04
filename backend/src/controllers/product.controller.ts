import { Request, Response } from 'express';
import { Product } from '@prisma/client';
import { productService } from '../services/product.service';
import { importExportService } from '../services/importExport.service';
import {
  bulkIdsSchema,
  ExportFormat,
  productInputSchema,
  ProductQueryParams,
} from '../types/product.types';

const VALID_SORT_FIELDS = new Set<keyof Product>([
  'ProductID',
  'ProductName',
  'ProductType',
  'Quantity',
  'Unit',
  'Price',
  'CreateDate',
  'UpdateDate',
]);

/**
 * 1 & 6. HIỂN THỊ BẢNG PHÂN TRANG (10-15 item/page) & TÌM KIẾM MEILISEARCH/FUSE.JS
 * GET /api/products?page=1&limit=10&search=...&type=...&unit=...
 */
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawSortBy = String(req.query.sortBy || 'ProductID') as keyof Product;
    const sortBy: keyof Product = VALID_SORT_FIELDS.has(rawSortBy) ? rawSortBy : 'ProductID';

    const queryParams: ProductQueryParams = {
      page: Math.max(1, Number(req.query.page) || 1),
      limit: Math.max(1, Math.min(100, Number(req.query.limit) || 10)),
      search: String(req.query.search || '').trim(),
      type: String(req.query.type || '').trim(),
      unit: String(req.query.unit || '').trim(),
      sortBy,
      sortOrder: String(req.query.sortOrder || 'desc') === 'asc' ? 'asc' : 'desc',
    };

    const result = await productService.listProducts(queryParams);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải danh sách thuốc',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 4. XEM CHI TIẾT SẢN PHẨM THUỐC
 * GET /api/products/:id
 */
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã thuốc (ProductID) không hợp lệ' });
      return;
    }

    const product = await productService.getById(id);
    if (!product) {
      res.status(404).json({ success: false, message: `Không tìm thấy thuốc có mã #${id}` });
      return;
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xem chi tiết thuốc',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 2. THÊM MỚI SẢN PHẨM THUỐC
 * POST /api/products
 */
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu đầu vào không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const created = await productService.create(parsed.data);
    res.status(201).json({
      success: true,
      message: 'Thêm mới sản phẩm thuốc thành công',
      data: created,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm mới sản phẩm thuốc',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 3. CẬP NHẬT SẢN PHẨM THUỐC
 * PUT /api/products/:id
 */
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã thuốc không hợp lệ' });
      return;
    }

    const parsed = productInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Dữ liệu cập nhật không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const updated = await productService.update(id, parsed.data);
    res.json({
      success: true,
      message: `Cập nhật thuốc #${id} thành công`,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi cập nhật sản phẩm thuốc',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 5a. XÓA 1 BẢN GHI ĐƯỢC CHỌN
 * DELETE /api/products/:id
 */
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã thuốc không hợp lệ' });
      return;
    }

    const deleted = await productService.deleteOne(id);
    res.json({
      success: true,
      message: `Đã xóa thuốc "${deleted.ProductName}" (#${id})`,
      data: deleted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Không thể xóa thuốc (có thể thuốc đang nằm trong hóa đơn đã bán)',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 5b. XÓA NHIỀU BẢN GHI ĐƯỢC CHỌN TỪ Ô CHECKBOX
 * POST /api/products/bulk-delete
 */
export const bulkDeleteProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Danh sách mã thuốc cần xóa không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const deletedCount = await productService.bulkDelete(parsed.data.ids);
    res.json({
      success: true,
      message: `Đã xóa thành công ${deletedCount} sản phẩm được chọn`,
      data: { deletedCount },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa hàng loạt (kiểm tra xem sản phẩm có đang nằm trong hóa đơn không)',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 7. SAO CHÉP 1 BẢN GHI (CLONE 1 RECORD)
 * POST /api/products/:id/clone
 */
export const cloneProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ success: false, message: 'Mã thuốc cần sao chép không hợp lệ' });
      return;
    }

    const cloned = await productService.cloneOne(id);
    res.status(201).json({
      success: true,
      message: `Đã sao chép thành công bản ghi #${id} -> #${cloned.ProductID}`,
      data: cloned,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi sao chép sản phẩm',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 8. SAO CHÉP NHIỀU BẢN GHI TỪ Ô CHECKBOX (BULK CLONE)
 * POST /api/products/bulk-clone
 */
export const bulkCloneProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Danh sách mã thuốc cần sao chép không hợp lệ',
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const clonedItems = await productService.bulkClone(parsed.data.ids);
    res.status(201).json({
      success: true,
      message: `Đã sao chép thành công ${clonedItems.length} bản ghi`,
      data: clonedItems,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi sao chép hàng loạt bản ghi',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 9a. XUẤT DỮ LIỆU RA EXCEL (.xlsx), JSON (.json), XML (.xml)
 * GET /api/products/export?format=xlsx|json|xml
 */
export const exportProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase() as ExportFormat;
    const products = await productService.getAllProducts();
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      const jsonContent = importExportService.exportToJson(products);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products_${dateStamp}.json"`);
      res.send(jsonContent);
      return;
    }

    if (format === 'xml') {
      const xmlContent = importExportService.exportToXml(products);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products_${dateStamp}.xml"`);
      res.send(xmlContent);
      return;
    }

    // Mặc định xuất file Excel (.xlsx)
    const excelBuffer = await importExportService.exportToExcel(products);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="products_${dateStamp}.xlsx"`);
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xuất dữ liệu sản phẩm',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * 9b. NHẬP DỮ LIỆU TỪ FILE EXCEL (.xlsx), JSON (.json), XML (.xml)
 * POST /api/products/import (multipart/form-data field: "file")
 */
export const importProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Vui lòng đính kèm file dữ liệu (.xlsx, .json hoặc .xml)',
      });
      return;
    }

    const parsedItems = await importExportService.parseImportFile(
      req.file.buffer,
      req.file.originalname
    );
    const importedCount = await productService.importBatch(parsedItems);

    res.status(201).json({
      success: true,
      message: `Đã nhập thành công ${importedCount} sản phẩm từ file "${req.file.originalname}"`,
      data: { importedCount },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi đọc file Import',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
