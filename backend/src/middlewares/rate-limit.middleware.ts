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

export const prescriptionUploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_RX_UPLOAD_MAX || 12),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RX_UPLOAD_RATE_LIMITED',
    message:
      'Quá nhiều yêu cầu tải ảnh toa thuốc từ địa chỉ IP này. Vui lòng thử lại sau 10 phút.',
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
