import { Router } from 'express';
import {
  createCustomerOnlineOrder,
  customerCancelOnlineOrder,
  downloadPrescriptionImage,
  getPublicStorefrontCatalog,
  listOnlineOrdersForStaff,
  pharmacistReviewOnlineOrder,
  trackCustomerOnlineOrder,
  updateOnlineOrderStage,
  uploadPrescriptionImage,
} from '../controllers/online-order.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';
import { publicReadLimiter, publicWriteLimiter } from '../middlewares/rate-limit.middleware';
import { prescriptionUploadMiddleware } from '../services/prescription-storage.service';

const router = Router();

// ============================================================================
// 1. PUBLIC ENDPOINTS CHO KHÁCH HÀNG (Rate-limited A4 + No unauthenticated B2B/PII)
// ============================================================================
router.get('/catalog', publicReadLimiter, getPublicStorefrontCatalog);
router.post(
  '/prescriptions',
  publicWriteLimiter,
  prescriptionUploadMiddleware.single('prescription'),
  uploadPrescriptionImage
);
router.post('/', publicWriteLimiter, createCustomerOnlineOrder);
router.get('/track', publicReadLimiter, trackCustomerOnlineOrder);
router.post('/:id/customer-cancel', publicWriteLimiter, customerCancelOnlineOrder);

// ============================================================================
// 2. STAFF RBAC ENDPOINTS CHO DƯỢC SĨ & ĐIỀU PHỐI VIÊN (A5 Private Rx + Review)
// ============================================================================
router.get(
  '/prescriptions/:fileKey',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  downloadPrescriptionImage
);

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
