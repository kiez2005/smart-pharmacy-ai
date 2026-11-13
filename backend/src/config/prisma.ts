import 'dotenv/config';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

export function resolveSqliteDatabaseUrl(rawUrl?: string): string {
  const input = (rawUrl || 'file:./prisma/pharmacy.db').trim();
  if (input === ':memory:') return input;
  const rawPath = input.replace(/^file:/, '');
  if (path.isAbsolute(rawPath)) {
    return `file:${rawPath}`;
  }
  const backendRoot = path.resolve(__dirname, '..', '..');
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('prisma/')) {
    return `file:${path.resolve(backendRoot, normalized)}`;
  }
  return `file:${path.resolve(backendRoot, 'prisma', normalized)}`;
}

// Singleton PrismaClient để tránh tạo quá nhiều kết nối khi hot-reload
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaBetterSqlite3({
  url: resolveSqliteDatabaseUrl(process.env.DATABASE_URL),
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
