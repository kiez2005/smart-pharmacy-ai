import { CORS_ORIGINS, PORT } from './config/env'; // Kiểm tra cấu hình môi trường ngay dòng đầu tiên
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import productRoutes from './routes/product.routes';
import authRoutes from './routes/auth.routes';
import invoiceRoutes from './routes/invoice.routes';
import contactRoutes from './routes/contact.routes';
import aiRoutes from './routes/ai.routes';
import enterpriseRoutes from './routes/enterprise.routes';
import onlineOrderRoutes from './routes/online-order.routes';
import { packagingService } from './services/packaging.service';
import { cleanupPrescriptionFiles } from './services/prescription-storage.service';

export const app = express();

app.disable('x-powered-by');
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Tracking-Token'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Endpoint kiểm tra sức khỏe hệ thống (Public)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    system: 'PharmaCore Enterprise ERP',
    database: 'SQLite (Prisma)',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/online-orders', onlineOrderRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.message === 'CORS_NOT_ALLOWED') {
    res.status(403).json({
      success: false,
      code: 'CORS_NOT_ALLOWED',
      message: 'Origin không được phép truy cập API này.',
    });
    return;
  }
  if (err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Dữ liệu gửi lên vượt quá giới hạn cho phép (1MB).',
    });
    return;
  }
  if (err && (err as { name?: string; code?: string }).name === 'MulterError') {
    res.status(400).json({
      success: false,
      code: 'UPLOAD_ERROR',
      message: 'Tệp tải lên không hợp lệ hoặc vượt quá dung lượng cho phép.',
    });
    return;
  }
  console.error('[HTTP ERROR]', err?.message || err);
  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Hệ thống gặp sự cố xử lý. Vui lòng thử lại sau.',
  });
});

const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

function runBackgroundMaintenance(): void {
  void packagingService.releaseExpiredReservations().catch((error) => {
    console.error('[Maintenance] Failed to release expired reservations:', error);
  });
  void cleanupPrescriptionFiles().catch((error) => {
    console.error('[Maintenance] Failed to clean up prescription files:', error);
  });
}

if (process.env.DISABLE_AUTO_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`[PharmaCore ERP Backend] Listening on http://localhost:${PORT}`);
    runBackgroundMaintenance();
    const timer = setInterval(runBackgroundMaintenance, MAINTENANCE_INTERVAL_MS);
    timer.unref();
  });
}
