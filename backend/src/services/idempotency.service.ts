import crypto from 'crypto';
import { prisma as defaultPrisma } from '../config/prisma';

export class IdempotencyConflictError extends Error {
  public statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => k !== 'idempotencyKey')
    .sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(record[k])).join(',') +
    '}'
  );
}

export function hashPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export async function checkIdempotency(
  rawKey: string | undefined,
  scope: string,
  actorKey: string,
  payload: unknown,
  tx: any = defaultPrisma
): Promise<{ hit: boolean; statusCode?: number; body?: any; compositeKey?: string; payloadHash?: string }> {
  const cleanKey = (rawKey || '').trim();
  if (!cleanKey) {
    return { hit: false };
  }
  const compositeKey = `${scope}:${actorKey}:${cleanKey}`;
  const payloadHash = hashPayload(payload);

  const existing = await tx.idempotencyRecord.findUnique({
    where: { IdempotencyKey: compositeKey },
  });

  if (!existing) {
    return { hit: false, compositeKey, payloadHash };
  }

  if (existing.PayloadHash !== payloadHash) {
    throw new IdempotencyConflictError(
      'Khóa Idempotency-Key đã được sử dụng với nội dung yêu cầu (payload) khác!'
    );
  }

  return {
    hit: true,
    statusCode: existing.StatusCode,
    body: JSON.parse(existing.ResponseJson),
    compositeKey,
    payloadHash,
  };
}

export async function saveIdempotency(
  compositeKey: string | undefined,
  scope: string,
  actorKey: string,
  payloadHashOrPayload: unknown,
  statusCode: number,
  body: unknown,
  tx: any = defaultPrisma
): Promise<void> {
  if (!compositeKey) return;
  const payloadHash =
    typeof payloadHashOrPayload === 'string'
      ? payloadHashOrPayload
      : hashPayload(payloadHashOrPayload);

  await tx.idempotencyRecord.upsert({
    where: { IdempotencyKey: compositeKey },
    update: {},
    create: {
      IdempotencyKey: compositeKey,
      Scope: scope,
      ActorKey: actorKey,
      PayloadHash: payloadHash,
      StatusCode: statusCode,
      ResponseJson: JSON.stringify(body),
    },
  });
}
