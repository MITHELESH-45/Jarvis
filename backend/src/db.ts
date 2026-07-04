import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development (e.g. during hot reloads)
declare global {
  // Allow global `prisma` to be defined
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
