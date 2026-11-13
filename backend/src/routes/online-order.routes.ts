import { Router } from 'express';
import {
  createCustomerOnlineOrder,
  customerCancelOnlineOrder,
  getPublicStorefrontCatalog,
  listOnlineOrdersForStaff,
  pharmacistReviewOnlineOrder,
  trackCustomerOnlineOrder,
  updateOnlineOrderStage,
} from '../controllers/online-order.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// ============================================================================
// 1. PUBLIC ENDPOINTS CHO KHÁCH HÀNG (Không yêu cầu JWT Nhân viên — Issue 1, 2 & 8)
// ============================================================================
router.get('/catalog', getPublicStorefrontCatalog);
router.post('/', createCustomerOnlineOrder);
router.get('/track', trackCustomerOnlineOrder);
router.post('/:id/customer-cancel', customerCancelOnlineOrder);

// ============================================================================
// 2. STAFF RBAC ENDPOINTS CHO DƯỢC SĨ & ĐIỀU PHỐI VIÊN (Issue 3, 4, 7, 10, 16)
// ============================================================================
router.get(
  '/',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']),
  listOnlineOrdersForStaff
);

router.post(
  '/:id/review',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  pharmacistReviewOnlineOrder
);

router.patch(
  '/:id/status',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST', 'CASHIER']),
  updateOnlineOrderStage
);

export default router;
