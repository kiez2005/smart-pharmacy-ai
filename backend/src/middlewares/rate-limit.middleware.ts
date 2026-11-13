import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH_MAX || 25),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ít phút.',
  },
});

export const publicWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PUBLIC_WRITE_MAX || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Bạn thao tác quá nhanh trên cổng trực tuyến. Vui lòng chờ 1 phút rồi thử lại.',
  },
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PUBLIC_READ_MAX || 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Lưu lượng truy cập vượt giới hạn. Vui lòng thử lại sau giây lát.',
  },
});
