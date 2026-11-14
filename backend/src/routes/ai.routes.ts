import { Router } from 'express';
import { diagnoseChat, ocrPrescription } from '../controllers/ai.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Gợi ý AI #1: OCR Quét Đơn thuốc / Hóa đơn (Chỉ Dược sĩ và Admin thao tác)
router.post(
  '/ocr-prescription',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  uploadMiddleware.single('file'),
  ocrPrescription
);

// Gợi ý AI #2, #3, #5: Trợ lý lâm sàng AI (Chỉ Dược sĩ và Admin thao tác, đồng bộ RBAC với UI)
router.post(
  '/diagnose-chat',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  diagnoseChat
);

export default router;
