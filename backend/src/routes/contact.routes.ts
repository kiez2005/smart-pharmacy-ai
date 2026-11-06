import { Router } from 'express';
import { createContact, getContacts, replyContact } from '../controllers/contact.controller';
import { authenticateToken, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Khách hàng gửi thư liên hệ / yêu cầu tư vấn (Public)
router.post('/', createContact);

// Dược sĩ xem danh sách thư cần phản hồi (ADMIN, PHARMACIST)
router.get('/', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), getContacts);

// Dược sĩ gửi phản hồi tư vấn cho bệnh nhân (ADMIN, PHARMACIST)
router.patch('/:id/reply', authenticateToken, requireRoles(['ADMIN', 'PHARMACIST']), replyContact);

export default router;
