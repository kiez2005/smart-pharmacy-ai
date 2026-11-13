import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export class IdempotencyConflictError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.statusCode = statusCode;
  }
}

export interface IdempotentTxResult<T> {
  replayed: boolean;
  statusCode: number;
  body: T;
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .filter((k) => k !== 'idempotencyKey')
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSortValue(obj[key]);
        return acc;
      }, {});
  }
  return value;
}

export function computePayloadHash(payload: unknown): string {
  const canonical = JSON.stringify(stableSortValue(payload));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function isRetryableSqliteBusyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const msg = String((err as { message?: string }).message || '').toLowerCase();
  return (
    code === 'P2034' ||
    code === 'P2028' ||
    msg.includes('database is locked') ||
    msg.includes('sqlite_busy') ||
    msg.includes('write conflict') ||
    msg.includes('deadlock')
  );
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'P2002';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Thực thi nghiệp vụ idempotent hoàn toàn BÊN TRONG Prisma transaction (A2):
 * 1. Ghi khóa `IN_PROGRESS` đầu transaction để khóa SQLite write lock ngay lập tức.
 * 2. Nếu trùng `(Scope, ActorKey, IdempotencyKey)` (`P2002`):
 *    - Khác `PayloadHash` -> ném `409 IdempotencyConflictError`
 *    - Đã `COMPLETED` -> trả response đã lưu, KHÔNG chạy lại business logic
 *    - Vẫn đang `IN_PROGRESS` -> ném `409 IdempotencyConflictError`
 * 3. Tự động retry ngắn khi gặp `SQLITE_BUSY` ở mức file lock khi nhiều request đến đồng thời.
 */
export async function runWithIdempotencyTx<T>(
  options: {
    rawKey?: string;
    scope: string;
    actorKey?: string;
    payload: unknown;
    maxBusyRetries?: number;
  },
  fn: (tx: Prisma.TransactionClient) => Promise<{ statusCode: number; body: T }>
): Promise<IdempotentTxResult<T>> {
  const key = options.rawKey?.trim();
  const actorKey = (options.actorKey || 'anonymous').trim();
  const scope = options.scope.trim();
  const maxRetries = options.maxBusyRetries ?? 6;
  const payloadHash = computePayloadHash(options.payload);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          if (!key) {
            const result = await fn(tx);
            return {
              replayed: false,
              statusCode: result.statusCode,
              body: result.body,
            };
          }

          let lockAcquired = false;
          try {
            await tx.idempotencyRecord.create({
              data: {
                IdempotencyKey: key,
                Scope: scope,
                ActorKey: actorKey,
                PayloadHash: payloadHash,
                Status: 'IN_PROGRESS',
                StatusCode: 102,
                ResponseJson: '',
              },
            });
            lockAcquired = true;
          } catch (lockErr) {
            if (!isUniqueConstraintError(lockErr)) {
              throw lockErr;
            }
          }

          if (!lockAcquired) {
            const existing = await tx.idempotencyRecord.findUnique({
              where: {
                Scope_ActorKey_IdempotencyKey: {
                  Scope: scope,
                  ActorKey: actorKey,
                  IdempotencyKey: key,
                },
              },
            });

            if (existing) {
              if (existing.PayloadHash !== payloadHash) {
                throw new IdempotencyConflictError(
                  'Khóa Idempotency-Key đã được sử dụng với nội dung yêu cầu (payload) khác!'
                );
              }
              if (existing.Status === 'COMPLETED') {
                return {
                  replayed: true,
                  statusCode: existing.StatusCode || 200,
                  body: JSON.parse(existing.ResponseJson || '{}') as T,
                };
              }
              throw new IdempotencyConflictError(
                'Yêu cầu trùng khóa Idempotency-Key đang được xử lý đồng thời. Vui lòng thử lại sau giây lát.'
              );
            }
          }

          const result = await fn(tx);

          await tx.idempotencyRecord.update({
            where: {
              Scope_ActorKey_IdempotencyKey: {
                Scope: scope,
                ActorKey: actorKey,
                IdempotencyKey: key,
              },
            },
            data: {
              Status: 'COMPLETED',
              StatusCode: result.statusCode,
              ResponseJson: JSON.stringify(result.body),
            },
          });

          return {
            replayed: false,
            statusCode: result.statusCode,
            body: result.body,
          };
        },
        {
          maxWait: 5000,
          timeout: 15000,
        }
      );
    } catch (err) {
      if (attempt < maxRetries && isRetryableSqliteBusyError(err)) {
        await sleep(20 + Math.floor(Math.random() * 35) * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw new IdempotencyConflictError('Hệ thống bận do xung đột giao dịch đồng thời, vui lòng thử lại.');
}
