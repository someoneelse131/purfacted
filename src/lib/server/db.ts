import { PrismaClient } from '@prisma/client';

// Reuse a single client across HMR reloads in dev to avoid connection leaks.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
