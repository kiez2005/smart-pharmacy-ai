import dotenv from 'dotenv';
import path from 'path';

// Nạp cấu hình từ .env ngay khi file được import
dotenv.config();

// Kiểm tra Fail-Fast cấu hình bảo mật bắt buộc
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret || rawJwtSecret.trim() === '') {
  console.error('================================================================');
  console.error('[CRITICAL SECURITY ERROR] Biến môi trường JWT_SECRET chưa được thiết lập!');
  console.error('Hệ thống bắt buộc dừng khởi động ngay lập tức để bảo vệ an toàn.');
  console.error('Vui lòng thiết lập JWT_SECRET trong file backend/.env');
  console.error('================================================================');
  process.exit(1);
}

export const JWT_SECRET: string = rawJwtSecret.trim();
export const PORT: number = Number(process.env.PORT) || 5000;
export const DATABASE_URL: string = process.env.DATABASE_URL || 'file:./pharmacy.db';
export const AI_SERVICE_URL: string = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
export const CORS_ORIGINS: string[] = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '12h';
export const RESERVATION_TTL_MINUTES: number = Math.max(5, Number(process.env.RESERVATION_TTL_MINUTES || 15));
export const TRACKING_TOKEN_TTL_DAYS: number = Math.max(1, Number(process.env.TRACKING_TOKEN_TTL_DAYS || 30));
