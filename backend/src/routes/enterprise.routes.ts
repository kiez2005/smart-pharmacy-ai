import { Router } from 'express';
import {
  checkDrugInteractions,
  createCustomer,
  createPurchaseOrder,
  createSupplier,
  getCustomers,
  getDashboardAnalytics,
  getPaymentsLedger,
  getProductStockCard,
  getPurchaseOrders,
  getStaffList,
  getSuppliers,
  updateCustomer,
  updateStaffRole,
} from '../controllers/enterprise.controller';

const router = Router();

// 1. Dashboard Tổng quan & Phân tích
router.get('/dashboard', getDashboardAnalytics);

// 2. Thẻ kho lịch sử Nhập/Xuất của từng mã thuốc Product
router.get('/products/:id/stock-card', getProductStockCard);

// 3. Nhà cung cấp & Phiếu nhập kho (Purchase Orders)
router.get('/suppliers', getSuppliers);
router.post('/suppliers', createSupplier);
router.get('/purchase-orders', getPurchaseOrders);
router.post('/purchase-orders', createPurchaseOrder);

// 4. Hồ sơ Bệnh nhân & Tiền sử dị ứng thuốc (Customers)
router.get('/customers', getCustomers);
router.post('/customers', createCustomer);
router.put('/customers/:id', updateCustomer);

// 5. Sổ quỹ Thanh toán & Đối soát (Payments Ledger)
router.get('/payments', getPaymentsLedger);

// 6. Quản lý Nhân sự Dược sĩ & Phân quyền (Staff)
router.get('/staff', getStaffList);
router.patch('/staff/:id/role', updateStaffRole);

// 7. Công cụ AI Kiểm tra tương tác & quá liều hoạt chất đa thuốc
router.post('/drug-interactions', checkDrugInteractions);

export default router;
