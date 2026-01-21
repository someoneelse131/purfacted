import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
		// Connection pool settings for better concurrent request handling
		datasources: {
			db: {
				url: process.env.DATABASE_URL
			}
		}
	});

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = db;
}

export type { User, Session, EmailVerification, PasswordReset } from '@prisma/client';
export { UserType } from '@prisma/client';
