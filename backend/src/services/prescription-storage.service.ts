import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../config/prisma';
import { deriveIsRxClassification } from './packaging.service';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'prescriptions');

const DEFAULT_QUOTA_MB = 200;
const DEFAULT_ORPHAN_TTL_HOURS = 24;
const DEFAULT_CLOSED_ORDER_TTL_HOURS = 0; // 0 = disabled by default so dispensed/closed orders follow long-term archive policy
const DEFAULT_RETENTION_DAYS = 730; // 2 years per Vietnam pharmacy prescription archive SOP
const SAFE_RX_FILE_KEY_REGEX = /^rx-[a-f0-9]{32}\.(jpg|png|webp)$/i;
const CLOSED_ORDER_STATUSES = new Set(['REJECTED', 'CANCELLED', 'EXPIRED', 'DELIVERED']);

export interface PrescriptionRetentionPolicy {
  orphanTtlMs: number | null;
  closedOrderTtlMs: number | null;
  maxRetentionMs: number | null;
  source: {
    orphanHours: number;
    closedOrderHours: number;
    retentionDays: number;
  };
}

function parseNonNegativeNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPrescriptionRetentionPolicy(): PrescriptionRetentionPolicy {
  const orphanHours = parseNonNegativeNumber(
    process.env.PRESCRIPTION_ORPHAN_TTL_HOURS,
    DEFAULT_ORPHAN_TTL_HOURS
  );
  const closedOrderHours = parseNonNegativeNumber(
    process.env.PRESCRIPTION_CLOSED_ORDER_TTL_HOURS,
    DEFAULT_CLOSED_ORDER_TTL_HOURS
  );
  const retentionDays = parseNonNegativeNumber(
    process.env.PRESCRIPTION_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS
  );

  return {
    orphanTtlMs: orphanHours > 0 ? orphanHours * 60 * 60 * 1000 : null,
    closedOrderTtlMs: closedOrderHours > 0 ? closedOrderHours * 60 * 60 * 1000 : null,
    maxRetentionMs: retentionDays > 0 ? retentionDays * 24 * 60 * 60 * 1000 : null,
    source: {
      orphanHours,
      closedOrderHours,
      retentionDays,
    },
  };
}

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
  retentionPolicy: PrescriptionRetentionPolicy;
}

export interface PrescriptionCleanupOptions {
  orphanTtlMs?: number | null;
  closedOrderTtlMs?: number | null;
  maxRetentionMs?: number | null;
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
  const retentionPolicy = getPrescriptionRetentionPolicy();
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

  return { fileCount, totalBytes, quotaBytes, retentionPolicy };
}

export function detectPrescriptionMimeFromKey(fileKey: string): string {
  const ext = fileKey.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function handlePrescriptionUploadHttp(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({
        success: false,
        code: 'MISSING_FILE',
        message: 'Vui lòng chọn ảnh đơn thuốc hợp lệ (PNG, JPG hoặc WEBP <= 3MB).',
      });
      return;
    }

    const saved = saveValidatedPrescriptionFile(req.file.buffer);
    res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_PRESCRIPTION_IMAGE') {
      res.status(400).json({
        success: false,
        code: 'INVALID_FILE_TYPE',
        message: 'Tệp không phải ảnh hợp lệ (chỉ chấp nhận JPEG, PNG, WEBP tối đa 3MB).',
      });
      return;
    }
    if (error instanceof Error && error.message === 'PRESCRIPTION_STORAGE_QUOTA_EXCEEDED') {
      res.status(507).json({
        success: false,
        code: 'PRESCRIPTION_STORAGE_QUOTA_EXCEEDED',
        message: 'Dung lượng lưu trữ toa thuốc đã đạt giới hạn tối đa. Vui lòng thử lại sau.',
      });
      return;
    }
    res.status(500).json({
      success: false,
      code: 'UPLOAD_FAILED',
      message: 'Không thể lưu ảnh đơn thuốc.',
    });
  }
}

export async function handlePrescriptionDownloadHttp(req: Request, res: Response): Promise<void> {
  const fileKey = String(req.params.fileKey || '').trim();
  const safePath = resolveSafePrescriptionFilePath(fileKey);
  if (!safePath) {
    res.status(404).json({
      success: false,
      code: 'PRESCRIPTION_NOT_FOUND',
      message: 'Không tìm thấy tệp đơn thuốc hợp lệ.',
    });
    return;
  }

  const mime = detectPrescriptionMimeFromKey(fileKey);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${fileKey}"`);
  res.sendFile(safePath);
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

  const policy = getPrescriptionRetentionPolicy();
  const nowMs = options.nowMs ?? Date.now();
  const orphanTtlMs =
    options.orphanTtlMs !== undefined ? options.orphanTtlMs : policy.orphanTtlMs;
  const closedOrderTtlMs =
    options.closedOrderTtlMs !== undefined ? options.closedOrderTtlMs : policy.closedOrderTtlMs;
  const maxRetentionMs =
    options.maxRetentionMs !== undefined ? options.maxRetentionMs : policy.maxRetentionMs;

  const candidateFiles = fs
    .readdirSync(UPLOAD_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SAFE_RX_FILE_KEY_REGEX.test(entry.name))
    .map((entry) => entry.name);

  if (candidateFiles.length === 0) {
    return result;
  }

  const [linkedOrders, linkedInvoices] = await Promise.all([
    prisma.onlineOrder.findMany({
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
    }),
    prisma.invoice.findMany({
      where: {
        PrescriptionFileKey: {
          in: candidateFiles,
        },
      },
      select: {
        InvoiceID: true,
        PrescriptionFileKey: true,
        Status: true,
        CreateDate: true,
        UpdateDate: true,
      },
    }),
  ]);

  const ordersByFileKey = new Map<string, typeof linkedOrders>();
  for (const order of linkedOrders) {
    if (!order.PrescriptionFileKey) continue;
    const list = ordersByFileKey.get(order.PrescriptionFileKey) ?? [];
    list.push(order);
    ordersByFileKey.set(order.PrescriptionFileKey, list);
  }

  const invoicesByFileKey = new Map<string, typeof linkedInvoices>();
  for (const invoice of linkedInvoices) {
    if (!invoice.PrescriptionFileKey) continue;
    const list = invoicesByFileKey.get(invoice.PrescriptionFileKey) ?? [];
    list.push(invoice);
    invoicesByFileKey.set(invoice.PrescriptionFileKey, list);
  }

  const cleanedOrderKeys: string[] = [];
  const cleanedInvoiceKeys: string[] = [];

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
    const invoices = invoicesByFileKey.get(fileKey) ?? [];
    let deleteReason: 'orphan' | 'closed' | 'retention' | null = null;

    if (orders.length === 0 && invoices.length === 0) {
      if (orphanTtlMs !== null && (orphanTtlMs <= 0 || nowMs - fileMtimeMs >= orphanTtlMs)) {
        deleteReason = 'orphan';
      }
    } else {
      const oldestCreatedMs = Math.min(
        fileMtimeMs,
        ...orders.map((o) => o.CreateDate.getTime()),
        ...invoices.map((inv) => inv.CreateDate.getTime())
      );
      if (
        maxRetentionMs !== null &&
        (maxRetentionMs <= 0 || nowMs - oldestCreatedMs >= maxRetentionMs)
      ) {
        deleteReason = 'retention';
      } else if (closedOrderTtlMs !== null && invoices.length === 0 && orders.length > 0) {
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
        cleanedOrderKeys.push(fileKey);
      }
      if (invoices.length > 0) {
        cleanedInvoiceKeys.push(fileKey);
      }
    } catch {
      // Ignore concurrent unlink error
    }
  }

  await Promise.all([
    cleanedOrderKeys.length > 0
      ? prisma.onlineOrder.updateMany({
          where: {
            PrescriptionFileKey: {
              in: cleanedOrderKeys,
            },
          },
          data: {
            PrescriptionFileKey: null,
            PrescriptionFileMime: null,
          },
        })
      : Promise.resolve(),
    cleanedInvoiceKeys.length > 0
      ? prisma.invoice.updateMany({
          where: {
            PrescriptionFileKey: {
              in: cleanedInvoiceKeys,
            },
          },
          data: {
            PrescriptionFileKey: null,
            PrescriptionFileMime: null,
          },
        })
      : Promise.resolve(),
  ]);

  return result;
}

export type ValidatePrescriptionResult =
  | {
      ok: true;
      requiresPrescription: boolean;
      fileKey: string | null;
      fileMime: string | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
    };

/**
 * Shared server-side validator used by both Online Checkout and POS Invoice flows:
 * forbids inline Base64 data URIs, verifies uploaded fileKey integrity, and enforces
 * a valid prescription file whenever any cart product is classified as Rx.
 */
export async function validatePrescriptionForProducts(params: {
  productIds: number[];
  prescriptionFileKey?: string | null;
  inlineImage?: string | null;
  note?: string | null;
  enforcePharmacistRole?: boolean;
  canDispenseRx?: boolean;
}): Promise<ValidatePrescriptionResult> {
  if (
    (params.inlineImage && /^data:image\//i.test(params.inlineImage)) ||
    (params.note && /data:image\//i.test(params.note))
  ) {
    return {
      ok: false,
      status: 400,
      code: 'BASE64_INLINE_FORBIDDEN',
      message: 'Không nhúng ảnh Base64 trực tiếp vào đơn hàng. Vui lòng tải ảnh qua API tải đơn thuốc.',
    };
  }

  const uniqueProductIds = Array.from(new Set(params.productIds));
  const orderedProducts =
    uniqueProductIds.length > 0
      ? await prisma.product.findMany({
          where: { ProductID: { in: uniqueProductIds } },
          include: { packaging: true },
        })
      : [];

  const requiresPrescription = orderedProducts.some((p) =>
    p.packaging ? Boolean(p.packaging.IsRx) : deriveIsRxClassification(p)
  );

  if (requiresPrescription && params.enforcePharmacistRole && !params.canDispenseRx) {
    return {
      ok: false,
      status: 403,
      code: 'RX_PHARMACIST_ROLE_REQUIRED',
      message:
        'Thuốc kê đơn (Rx) chỉ được phép bán và duyệt đơn bởi Dược sĩ hoặc Quản trị viên. Thu ngân (CASHIER) không được phép xuất bán thuốc Rx.',
    };
  }

  let validatedFileKey: string | null = null;
  let validatedFileMime: string | null = null;
  const trimmedKey = params.prescriptionFileKey?.trim() || '';
  if (trimmedKey) {
    const resolvedPath = resolveSafePrescriptionFilePath(trimmedKey);
    if (!resolvedPath) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_PRESCRIPTION_FILE_KEY',
        message: 'Mã tệp ảnh đơn thuốc không tồn tại hoặc không hợp lệ.',
      };
    }
    validatedFileKey = trimmedKey;
    validatedFileMime = detectPrescriptionMimeFromKey(trimmedKey);
  }

  if (requiresPrescription && !validatedFileKey) {
    return {
      ok: false,
      status: 400,
      code: 'PRESCRIPTION_REQUIRED',
      message:
        'Đơn hàng chứa thuốc kê đơn (Rx). Vui lòng tải lên ảnh toa thuốc bác sĩ hợp lệ trước khi tiếp tục.',
    };
  }

  return {
    ok: true,
    requiresPrescription,
    fileKey: validatedFileKey,
    fileMime: validatedFileMime,
  };
}
