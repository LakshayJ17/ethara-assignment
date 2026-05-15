import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Set it to your Railway PostgreSQL connection string or local Postgres URL.');
}

export const prisma = globalThis.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
