import { Router } from 'express';
import {
  bulkCloneProducts,
  bulkDeleteProducts,
  cloneProduct,
  createProduct,
  deleteProduct,
  exportProducts,
  getProductById,
  getProducts,
  importProducts,
  updateProduct,
} from '../controllers/product.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// ============================================================================
// ĐẦY ĐỦ 11 CHỨC NĂNG BẮT BUỘC CỦA MODULE PRODUCT (THEO SHEET YÊU CẦU BTL)
// ============================================================================

// #9: Import & Export dữ liệu (Excel .xlsx, JSON .json, XML .xml)
router.get('/export', exportProducts);
router.post('/import', uploadMiddleware.single('file'), importProducts);

// #5b & #8: Thao tác hàng loạt từ ô Checkbox (Xóa nhiều & Sao chép nhiều)
router.post('/bulk-delete', bulkDeleteProducts);
router.post('/bulk-clone', bulkCloneProducts);

// #1 & #6: Phân trang (10-15 item/page) + Tìm kiếm thông minh (Meilisearch / Fuse.js)
router.get('/', getProducts);

// #4: Xem chi tiết 1 sản phẩm
router.get('/:id', getProductById);

// #2: Thêm mới sản phẩm
router.post('/', createProduct);

// #3: Cập nhật sản phẩm
router.put('/:id', updateProduct);

// #5a: Xóa 1 sản phẩm
router.delete('/:id', deleteProduct);

// #7: Sao chép 1 sản phẩm
router.post('/:id/clone', cloneProduct);

export default router;
