import { Router } from 'express';
import {
  createContact,
  draftContactAiReply,
  getContactMailStatus,
  getContacts,
  replyContact,
  sendContactTestMail,
} from '../controllers/contact.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';
import { publicWriteLimiter } from '../middlewares/rate-limit.middleware';

const router = Router();

// Khách hàng gửi thư liên hệ / yêu cầu tư vấn (Public, rate-limited A4)
router.post('/', publicWriteLimiter, createContact);

// Kiểm tra & gửi thử kết nối Gmail SMTP thật (ADMIN, PHARMACIST)
router.get('/mail-status', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getContactMailStatus);
router.post('/test-mail', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), sendContactTestMail);

// Dược sĩ xem danh sách thư cần phản hồi (ADMIN, PHARMACIST)
router.get('/', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getContacts);

// AI gợi ý soạn bản nháp phản hồi lâm sàng + đọc ảnh toa đính kèm (ADMIN, PHARMACIST)
router.post('/:id/ai-draft-reply', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), draftContactAiReply);

// Dược sĩ lưu phản hồi & gửi Gmail thật cho bệnh nhân (ADMIN, PHARMACIST)
router.patch('/:id/reply', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), replyContact);

export default router;
