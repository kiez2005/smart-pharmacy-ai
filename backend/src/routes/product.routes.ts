import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
} from '../controllers/product.controller';

const router = Router();

// Sprint 1: Các API cơ bản của bảng Product (Phân trang 10-15 item, Xem chi tiết, Thêm mới, Cập nhật)
router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);

export default router;
