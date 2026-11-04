import { Router } from 'express';
import { createInvoice, getInvoices } from '../controllers/invoice.controller';

const router = Router();

router.get('/', getInvoices);
router.post('/', createInvoice);

export default router;
