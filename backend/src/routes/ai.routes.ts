import { Router } from 'express';
import { diagnoseChat, ocrPrescription } from '../controllers/ai.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';

const router = Router();

// Gợi ý AI #1: OCR Quét Đơn thuốc / Hóa đơn (OpenCV + OCR)
router.post('/ocr-prescription', uploadMiddleware.single('file'), ocrPrescription);

// Gợi ý AI #2, #3, #5: Chatbot & Chẩn đoán Y tế sơ bộ (Scikit-learn TF-IDF + RAG)
router.post('/diagnose-chat', diagnoseChat);

export default router;
