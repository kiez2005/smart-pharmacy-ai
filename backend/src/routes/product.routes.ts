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
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// ============================================================================
// ĐẦY ĐỦ 11 CHỨC NĂNG BẮT BUỘC CỦA MODULE PRODUCT + PHÂN QUYỀN RBAC CHẶT CHẼ
// ============================================================================

// #9: Import & Export dữ liệu (Yêu cầu ADMIN hoặc PHARMACIST)
router.get('/export', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), exportProducts);
router.post(
  '/import',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  uploadMiddleware.single('file'),
  importProducts
);

// #5b & #8: Thao tác hàng loạt từ ô Checkbox
// Xóa nhiều thuốc: Chỉ ADMIN được phép
router.post('/bulk-delete', authenticateToken, requireRoles(['ADMIN']), bulkDeleteProducts);
// Nhân bản nhiều thuốc: ADMIN và PHARMACIST
router.post('/bulk-clone', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), bulkCloneProducts);

// #1 & #6: Phân trang (10-15 item/page) + Tìm kiếm (Mọi tài khoản đã đăng nhập đều xem được)
router.get('/', authenticateToken, getProducts);

// #4: Xem chi tiết 1 sản phẩm
router.get('/:id', authenticateToken, getProductById);

// #2: Thêm mới sản phẩm (ADMIN hoặc PHARMACIST)
router.post('/', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), createProduct);

// #3: Cập nhật sản phẩm (ADMIN hoặc PHARMACIST)
router.put('/:id', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), updateProduct);

// #5a: Xóa 1 sản phẩm (Chỉ duy nhất ADMIN)
router.delete('/:id', authenticateToken, requireRoles(['ADMIN']), deleteProduct);

// #7: Sao chép 1 sản phẩm (ADMIN hoặc PHARMACIST)
router.post('/:id/clone', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), cloneProduct);

export default router;
