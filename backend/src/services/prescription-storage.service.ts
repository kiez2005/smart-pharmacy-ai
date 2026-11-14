import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { prisma } from '../config/prisma';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'prescriptions');

const DEFAULT_QUOTA_MB = 200;
export const PRESCRIPTION_ORPHAN_TTL_MS = 60 * 60 * 1000; // 1 hour for abandoned uploads
export const PRESCRIPTION_CLOSED_ORDER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours after close
export const PRESCRIPTION_RETENTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days max retention
const SAFE_RX_FILE_KEY_REGEX = /^rx-[a-f0-9]{32}\.(jpg|png|webp)$/i;
const CLOSED_ORDER_STATUSES = new Set(['REJECTED', 'CANCELLED', 'EXPIRED', 'DELIVERED']);

export function getPrescriptionStorageQuotaBytes(): number {
  const rawMb = Number(process.env.PRESCRIPTION_STORAGE_QUOTA_MB ?? DEFAULT_QUOTA_MB);
  const mb = Number.isFinite(rawMb) && rawMb > 0 ? rawMb : DEFAULT_QUOTA_MB;
  return Math.floor(mb * 1024 * 1024);
}

export const PRESCRIPTION_STORAGE_QUOTA_BYTES = getPrescriptionStorageQuotaBytes();

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

export interface PrescriptionStorageStats {
  fileCount: number;
  totalBytes: number;
  quotaBytes: number;
}

export interface PrescriptionCleanupOptions {
  orphanTtlMs?: number;
  closedOrderTtlMs?: number;
  maxRetentionMs?: number;
  nowMs?: number;
}

export interface PrescriptionCleanupResult {
  deletedOrphans: number;
  deletedClosedOrders: number;
  deletedExpiredRetention: number;
  freedBytes: number;
}

export function getPrescriptionStorageStats(): PrescriptionStorageStats {
  ensureUploadRoot();
  const quotaBytes = getPrescriptionStorageQuotaBytes();
  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    try {
      const stat = fs.statSync(path.join(UPLOAD_ROOT, entry.name));
      fileCount += 1;
      totalBytes += stat.size;
    } catch {
      // File may have been unlinked concurrently by cleanup
    }
  }

  return { fileCount, totalBytes, quotaBytes };
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

  const stats = getPrescriptionStorageStats();
  if (stats.totalBytes + buffer.length > stats.quotaBytes) {
    throw new Error('PRESCRIPTION_STORAGE_QUOTA_EXCEEDED');
  }

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
  if (!SAFE_RX_FILE_KEY_REGEX.test(fileKey)) {
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

export async function cleanupPrescriptionFiles(
  options: PrescriptionCleanupOptions = {}
): Promise<PrescriptionCleanupResult> {
  const result: PrescriptionCleanupResult = {
    deletedOrphans: 0,
    deletedClosedOrders: 0,
    deletedExpiredRetention: 0,
    freedBytes: 0,
  };

  if (!fs.existsSync(UPLOAD_ROOT)) {
    return result;
  }

  const nowMs = options.nowMs ?? Date.now();
  const orphanTtlMs = options.orphanTtlMs ?? PRESCRIPTION_ORPHAN_TTL_MS;
  const closedOrderTtlMs = options.closedOrderTtlMs ?? PRESCRIPTION_CLOSED_ORDER_TTL_MS;
  const maxRetentionMs = options.maxRetentionMs ?? PRESCRIPTION_RETENTION_TTL_MS;

  const candidateFiles = fs
    .readdirSync(UPLOAD_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SAFE_RX_FILE_KEY_REGEX.test(entry.name))
    .map((entry) => entry.name);

  if (candidateFiles.length === 0) {
    return result;
  }

  const linkedOrders = await prisma.onlineOrder.findMany({
    where: {
      PrescriptionFileKey: {
        in: candidateFiles,
      },
    },
    select: {
      OrderID: true,
      PrescriptionFileKey: true,
      Status: true,
      CreateDate: true,
      UpdateDate: true,
      ReviewedAt: true,
    },
  });

  const ordersByFileKey = new Map<string, typeof linkedOrders>();
  for (const order of linkedOrders) {
    if (!order.PrescriptionFileKey) continue;
    const list = ordersByFileKey.get(order.PrescriptionFileKey) ?? [];
    list.push(order);
    ordersByFileKey.set(order.PrescriptionFileKey, list);
  }

  const cleanedKeys: string[] = [];

  for (const fileKey of candidateFiles) {
    const fullPath = path.join(UPLOAD_ROOT, fileKey);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    const fileMtimeMs = Math.floor(stat.mtimeMs);
    const orders = ordersByFileKey.get(fileKey) ?? [];
    let deleteReason: 'orphan' | 'closed' | 'retention' | null = null;

    if (orders.length === 0) {
      if (orphanTtlMs <= 0 || nowMs - fileMtimeMs >= orphanTtlMs) {
        deleteReason = 'orphan';
      }
    } else {
      const oldestCreatedMs = Math.min(
        fileMtimeMs,
        ...orders.map((o) => o.CreateDate.getTime())
      );
      if (maxRetentionMs <= 0 || nowMs - oldestCreatedMs >= maxRetentionMs) {
        deleteReason = 'retention';
      } else {
        const allClosedExpired = orders.every((o) => {
          if (!CLOSED_ORDER_STATUSES.has(o.Status)) return false;
          const closedAtMs = Math.max(
            o.UpdateDate.getTime(),
            o.ReviewedAt ? o.ReviewedAt.getTime() : 0
          );
          return closedOrderTtlMs <= 0 || nowMs - closedAtMs >= closedOrderTtlMs;
        });
        if (allClosedExpired) {
          deleteReason = 'closed';
        }
      }
    }

    if (!deleteReason) {
      continue;
    }

    try {
      fs.unlinkSync(fullPath);
      result.freedBytes += stat.size;
      if (deleteReason === 'orphan') result.deletedOrphans += 1;
      if (deleteReason === 'closed') result.deletedClosedOrders += 1;
      if (deleteReason === 'retention') result.deletedExpiredRetention += 1;
      if (orders.length > 0) {
        cleanedKeys.push(fileKey);
      }
    } catch {
      // Ignore concurrent unlink error
    }
  }

  if (cleanedKeys.length > 0) {
    await prisma.onlineOrder.updateMany({
      where: {
        PrescriptionFileKey: {
          in: cleanedKeys,
        },
      },
      data: {
        PrescriptionFileKey: null,
        PrescriptionFileMime: null,
      },
    });
  }

  return result;
}
