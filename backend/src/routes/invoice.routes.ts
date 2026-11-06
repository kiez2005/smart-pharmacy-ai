import { Router } from 'express';
import { cancelInvoice, createInvoice, getInvoices } from '../controllers/invoice.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Xem danh sách hóa đơn bán lẻ (Mọi vai trò đã đăng nhập)
router.get('/', authenticateToken, getInvoices);

// Lập hóa đơn POS & xuất bán (CASHIER, PHARMACIST, ADMIN)
router.post('/', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']), createInvoice);

// Hủy / Hoàn trả hóa đơn (Chỉ duy nhất ADMIN hoặc PHARMACIST để tránh thất thoát kho)
router.post('/:id/cancel', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), cancelInvoice);

export default router;
