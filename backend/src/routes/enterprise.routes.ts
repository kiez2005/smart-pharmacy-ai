import { Router } from 'express';
import multer from 'multer';
import {
  cancelPurchaseOrder,
  checkDrugInteractions,
  cloneEntityRecords,
  createCustomer,
  createPurchaseOrder,
  createSupplier,
  deleteEntityRecords,
  exportEntityData,
  getCustomers,
  getDashboardAnalytics,
  getPaymentsLedger,
  getProductStockCard,
  getPurchaseOrders,
  getStaffList,
  getSuppliers,
  importEntityData,
  updateCustomer,
  updateStaffRole,
  updateSupplier,
} from '../controllers/enterprise.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max import file size (P1-06)
    files: 1,
  },
});

// 1. Dashboard Tổng quan & Phân tích Tài chính (Chỉ ADMIN và PHARMACIST — P1-01)
router.get('/dashboard', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getDashboardAnalytics);

// 2. Thẻ kho lịch sử Nhập/Xuất & Giá vốn của từng mã thuốc (Chỉ ADMIN và PHARMACIST — P1-01)
router.get(
  '/products/:id/stock-card',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  getProductStockCard
);

// 3. Nhà cung cấp & Phiếu nhập kho (Purchase Orders — Chỉ ADMIN và PHARMACIST — P1-01)
router.get('/suppliers', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getSuppliers);
router.post('/suppliers', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), createSupplier);
router.put('/suppliers/:id', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), updateSupplier);
router.get('/purchase-orders', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getPurchaseOrders);
router.post('/purchase-orders', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), createPurchaseOrder);
router.post(
  '/purchase-orders/:id/cancel',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  cancelPurchaseOrder
);

// 4. Hồ sơ Bệnh nhân & Tiền sử dị ứng thuốc (Customers)
router.get('/customers', authenticateToken, getCustomers);
router.post('/customers', authenticateToken, createCustomer);
router.put('/customers/:id', authenticateToken, updateCustomer);

// 5. Sổ quỹ Thanh toán & Đối soát (Payments Ledger) - Yêu cầu ADMIN hoặc PHARMACIST
router.get('/payments', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getPaymentsLedger);

// 6. Quản lý Nhân sự Dược sĩ & Phân quyền (Chỉ duy nhất ADMIN)
router.get('/staff', authenticateToken, requireRoles(['ADMIN']), getStaffList);
router.patch('/staff/:id/role', authenticateToken, requireRoles(['ADMIN']), updateStaffRole);
router.patch('/staff/:id/status', authenticateToken, requireRoles(['ADMIN']), updateStaffRole);

// 7. Công cụ AI Kiểm tra tương tác & quá liều hoạt chất đa thuốc
router.post('/drug-interactions', authenticateToken, checkDrugInteractions);

// 8. Các thao tác mở rộng: Xóa, Nhân bản, Export/Import
router.delete('/:entity/:id', authenticateToken, requireRoles(['ADMIN']), deleteEntityRecords);
router.post('/:entity/bulk-delete', authenticateToken, requireRoles(['ADMIN']), deleteEntityRecords);
router.post('/:entity/:id/clone', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), cloneEntityRecords);
router.post('/:entity/bulk-clone', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), cloneEntityRecords);
router.get('/export/:entity', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), exportEntityData);
router.post('/import/:entity', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), upload.single('file'), importEntityData);

export default router;
