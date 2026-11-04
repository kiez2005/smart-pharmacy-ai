import multer from 'multer';
import path from 'path';

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.json', '.xml', '.png', '.jpg', '.jpeg', '.webp']);

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Tối đa 10MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`Định dạng file ${ext} không được hỗ trợ. Chỉ chấp nhận: .xlsx, .json, .xml hoặc ảnh.`));
      return;
    }
    cb(null, true);
  },
});
