import dotenv from 'dotenv';
import path from 'path';

// Nạp cấu hình từ .env ngay khi file được import
dotenv.config();

const KNOWN_WEAK_OR_SAMPLE_SECRETS = new Set([
  'smart_pharmacy_d18cnpm5_secret_key_2026',
  'replace-with-a-strong-random-jwt-secret-at-least-32-chars',
  'secret',
  'jwt_secret',
  '123456',
  'changeme',
  'default_secret',
]);

export function validateJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const trimmed = (secret || '').trim();
  if (!trimmed) {
    throw new Error('CRITICAL SECURITY ERROR: Biến môi trường JWT_SECRET chưa được thiết lập!');
  }

  const isProd = (nodeEnv || '').toLowerCase() === 'production';
  if (isProd) {
    if (trimmed.length < 32 || KNOWN_WEAK_OR_SAMPLE_SECRETS.has(trimmed.toLowerCase())) {
      throw new Error(
        'CRITICAL SECURITY ERROR: JWT_SECRET trong môi trường production phải có độ dài tối thiểu 32 ký tự và không được trùng giá trị mẫu/yếu!'
      );
    }
  }

  return trimmed;
}

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

try {
  validateJwtSecret(rawJwtSecret, process.env.NODE_ENV);
} catch (err) {
  console.error('================================================================');
  console.error(err instanceof Error ? err.message : '[CRITICAL SECURITY ERROR] JWT_SECRET không hợp lệ!');
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
