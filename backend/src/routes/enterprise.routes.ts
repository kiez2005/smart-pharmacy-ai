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

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// 1. Dashboard Tổng quan & Phân tích
router.get('/dashboard', getDashboardAnalytics);

// 2. Thẻ kho lịch sử Nhập/Xuất của từng mã thuốc Product
router.get('/products/:id/stock-card', getProductStockCard);

// 3. Nhà cung cấp & Phiếu nhập kho (Purchase Orders)
router.get('/suppliers', getSuppliers);
router.post('/suppliers', createSupplier);
router.put('/suppliers/:id', updateSupplier);
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

// 8. Các thao tác chuẩn 11 chức năng cho mọi bảng dữ liệu
// (Xóa đơn, Xóa hàng loạt, Nhân bản đơn, Nhân bản hàng loạt, Export/Import Excel/JSON/XML)
router.delete('/:entity/:id', deleteEntityRecords);
router.post('/:entity/bulk-delete', deleteEntityRecords);
router.post('/:entity/:id/clone', cloneEntityRecords);
router.post('/:entity/bulk-clone', cloneEntityRecords);
router.get('/export/:entity', exportEntityData);
router.post('/import/:entity', upload.single('file'), importEntityData);

export default router;
