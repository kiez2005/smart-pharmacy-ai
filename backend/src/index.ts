import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productRoutes from './routes/product.routes';
import authRoutes from './routes/auth.routes';
import invoiceRoutes from './routes/invoice.routes';
import contactRoutes from './routes/contact.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    project: 'Hệ thống Quản lý Nhà thuốc & Kinh doanh Dược phẩm Thông minh tích hợp AI (D18CNPM5)',
    database: 'SQLite (Prisma ORM)',
    timestamp: new Date().toISOString(),
  });
});

// Các nhóm Route cho đầy đủ các Form nghiệp vụ
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/contacts', contactRoutes);

app.listen(PORT, () => {
  console.log(`🚀 [Smart Pharmacy Backend] đang chạy tại: http://localhost:${PORT}`);
  console.log(`📦 API Danh sách Thuốc (Phân trang): http://localhost:${PORT}/api/products?page=1&limit=10`);
});
