import multer from 'multer';
import path from 'path';

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.json', '.xml', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.wav', '.mp3', '.m4a', '.mp4']);
const ALLOWED_KNOWLEDGE_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);

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

export const audioUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // Tối đa 15MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext) || mime.startsWith('audio/')) {
      cb(null, true);
      return;
    }
    cb(new Error(`Định dạng âm thanh ${ext || mime} không được hỗ trợ. Chỉ chấp nhận: webm, ogg, wav, mp3, m4a.`));
  },
});

export const knowledgeDocUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_KNOWLEDGE_EXTENSIONS.has(ext)) {
      cb(new Error(`Định dạng tài liệu ${ext} không được hỗ trợ. Chỉ chấp nhận: .pdf, .txt, .md.`));
      return;
    }
    cb(null, true);
  },
});
