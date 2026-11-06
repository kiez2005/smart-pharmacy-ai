import { Router } from 'express';
import multer from 'multer';
import {
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
const upload = multer({ storage: multer.memoryStorage() });

// 1. Dashboard Tổng quan & Phân tích (Mọi tài khoản đăng nhập)
router.get('/dashboard', authenticateToken, getDashboardAnalytics);

// 2. Thẻ kho lịch sử Nhập/Xuất của từng mã thuốc Product (Mọi tài khoản đăng nhập)
router.get('/products/:id/stock-card', authenticateToken, getProductStockCard);

// 3. Nhà cung cấp & Phiếu nhập kho (Purchase Orders)
router.get('/suppliers', authenticateToken, getSuppliers);
router.post('/suppliers', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), createSupplier);
router.put('/suppliers/:id', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), updateSupplier);
router.get('/purchase-orders', authenticateToken, getPurchaseOrders);
router.post('/purchase-orders', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), createPurchaseOrder);

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
