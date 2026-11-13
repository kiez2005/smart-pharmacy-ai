import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'prescriptions');

function ensureUploadRoot(): void {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

export const PRESCRIPTION_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

export const prescriptionUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRESCRIPTION_MAX_BYTES,
    files: 1,
  },
});

export function detectImageMimeFromMagicBytes(buffer: Buffer): { mime: string; ext: string } | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

export function saveValidatedPrescriptionFile(buffer: Buffer): {
  fileKey: string;
  mime: string;
  sizeBytes: number;
} {
  const detected = detectImageMimeFromMagicBytes(buffer);
  if (!detected) {
    throw new Error('INVALID_PRESCRIPTION_IMAGE');
  }

  ensureUploadRoot();
  const safeRandom = crypto.randomBytes(16).toString('hex');
  const fileKey = `rx-${safeRandom}.${detected.ext}`;
  const fullPath = path.join(UPLOAD_ROOT, fileKey);
  fs.writeFileSync(fullPath, buffer, { mode: 0o600 });

  return {
    fileKey,
    mime: detected.mime,
    sizeBytes: buffer.length,
  };
}

export function resolveSafePrescriptionFilePath(fileKey: string): string | null {
  if (!/^rx-[a-f0-9]{32}\.(jpg|png|webp)$/i.test(fileKey)) {
    return null;
  }
  const fullPath = path.resolve(UPLOAD_ROOT, fileKey);
  if (!fullPath.startsWith(UPLOAD_ROOT + path.sep) && fullPath !== UPLOAD_ROOT) {
    return null;
  }
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}
