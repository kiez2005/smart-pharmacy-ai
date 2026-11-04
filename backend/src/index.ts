import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productRoutes from './routes/product.routes';
import authRoutes from './routes/auth.routes';
import invoiceRoutes from './routes/invoice.routes';
import contactRoutes from './routes/contact.routes';
import aiRoutes from './routes/ai.routes';
import enterpriseRoutes from './routes/enterprise.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    system: 'PharmaCore Enterprise ERP',
    database: 'SQLite (8 Relational Models via Prisma)',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/enterprise', enterpriseRoutes);

app.listen(PORT, () => {
  console.log(`[PharmaCore ERP Backend] Listening on http://localhost:${PORT}`);
});
