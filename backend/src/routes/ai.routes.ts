import { Router } from 'express';
import {
  chatRag,
  chatRagStream,
  createKnowledgeDocController,
  diagnoseChat,
  getAiHealth,
  listKnowledgeDocsController,
  ocrPrescription,
  speechToText,
  toggleKnowledgeDocController,
  uploadKnowledgeDocFileController,
  verifyOcrDraft,
} from '../controllers/ai.controller';
import {
  audioUploadMiddleware,
  knowledgeDocUploadMiddleware,
  uploadMiddleware,
} from '../middlewares/upload.middleware';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Trạng thái sức khỏe thực tế của các model AI local
router.get('/health', authenticateToken, getAiHealth);

// OCR Quét Đơn thuốc thật (RapidOCR + OpenCV) -> Top-K candidates + Draft
router.post(
  '/ocr-prescription',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  uploadMiddleware.single('file'),
  ocrPrescription
);

// Xác nhận từng dòng OCR trước khi chuyển sang POS / tạo hóa đơn
router.post(
  '/ocr-drafts/:draftId/verify',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  verifyOcrDraft
);

// Nhận dạng giọng nói local bằng Faster-Whisper
router.post(
  '/speech-to-text',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  audioUploadMiddleware.single('file'),
  speechToText
);

// Chatbot RAG có nguồn (Gemini AI Studio / Qwen fallback) + SSE Streaming cho ERP
router.post(
  '/chat-rag',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  chatRag
);

router.post(
  '/chat-rag/stream',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  chatRagStream
);

router.post(
  '/diagnose-chat',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  diagnoseChat
);

// Quản lý Kho tri thức Tờ HDSD & Dược thư kiểm chứng
router.get(
  '/knowledge',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  listKnowledgeDocsController
);

router.post(
  '/knowledge',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  createKnowledgeDocController
);

router.post(
  '/knowledge/upload',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  knowledgeDocUploadMiddleware.single('file'),
  uploadKnowledgeDocFileController
);

router.patch(
  '/knowledge/:id/toggle',
  authenticateToken,
  requireRoles(['ADMIN', 'PHARMACIST']),
  toggleKnowledgeDocController
);

export default router;
