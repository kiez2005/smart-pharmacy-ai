import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export function resolveSqliteDatabaseUrl(rawUrl?: string): string {
  const input = (rawUrl || 'file:./prisma/pharmacy.db').trim();
  if (input === ':memory:') return input;
  const rawPath = input.replace(/^file:/, '');
  if (path.isAbsolute(rawPath)) {
    return `file:${rawPath}`;
  }
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('prisma/')) {
    return `file:${path.resolve(__dirname, normalized)}`;
  }
  return `file:${path.resolve(__dirname, 'prisma', normalized)}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveSqliteDatabaseUrl(process.env.DATABASE_URL),
  },
});
