import { Router } from 'express';
import { cancelInvoice, createInvoice, getInvoices } from '../controllers/invoice.controller';

const router = Router();

router.get('/', getInvoices);
router.post('/', createInvoice);
router.post('/:id/cancel', cancelInvoice);

export default router;
