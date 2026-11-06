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

// Gợi ý AI #2, #3, #5: Chatbot & Chẩn đoán Y tế sơ bộ (Mọi nhân sự đã đăng nhập)
router.post('/diagnose-chat', authenticateToken, diagnoseChat);

export default router;
