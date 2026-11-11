import { Router } from 'express';
import {
  cancelInvoice,
  collectInvoiceDebt,
  createInvoice,
  getInvoices,
  updateFulfillmentStatus,
} from '../controllers/invoice.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Xem danh sách hóa đơn đa kênh (Mọi vai trò đã đăng nhập)
router.get('/', authenticateToken, getInvoices);

// Lập hóa đơn POS, Bán buôn B2B & Đặt hàng Online (CASHIER, PHARMACIST, ADMIN)
router.post('/', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']), createInvoice);

// Cập nhật tiến trình xử lý & giao đơn hàng Online
router.patch(
  '/:id/fulfillment',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']),
  updateFulfillmentStatus
);

// Thu hồi công nợ hóa đơn bán buôn / khách sỉ
router.post(
  '/:id/pay-debt',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']),
  collectInvoiceDebt
);

// Hủy / Hoàn trả hóa đơn (Chỉ duy nhất ADMIN hoặc PHARMACIST để tránh thất thoát kho)
router.post('/:id/cancel', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), cancelInvoice);

export default router;
