import { Router } from 'express';
import { createContact, getContacts, replyContact } from '../controllers/contact.controller';

const router = Router();

router.get('/', getContacts);
router.post('/', createContact);
router.patch('/:id/reply', replyContact);

export default router;
