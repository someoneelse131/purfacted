import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient before importing db
vi.mock('@prisma/client', () => {
	const mockPrismaClient = vi.fn().mockImplementation(() => ({
		user: {
			create: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		session: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn()
		},
		emailVerification: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn()
		},
		passwordReset: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn()
		},
		$connect: vi.fn(),
		$disconnect: vi.fn()
	}));

	return {
		PrismaClient: mockPrismaClient,
		UserType: {
			ANONYMOUS: 'ANONYMOUS',
			VERIFIED: 'VERIFIED',
			EXPERT: 'EXPERT',
			PHD: 'PHD',
			ORGANIZATION: 'ORGANIZATION',
			MODERATOR: 'MODERATOR'
		}
	};
});

describe('R2: Database Schema & Prisma Setup', () => {
	describe('Prisma Client', () => {
		it('should export db client', async () => {
			const { db } = await import('./db');
			expect(db).toBeDefined();
		});

		it('should export UserType enum', async () => {
			const { UserType } = await import('./db');
			expect(UserType).toBeDefined();
			expect(UserType.ANONYMOUS).toBe('ANONYMOUS');
			expect(UserType.VERIFIED).toBe('VERIFIED');
			expect(UserType.EXPERT).toBe('EXPERT');
			expect(UserType.PHD).toBe('PHD');
			expect(UserType.ORGANIZATION).toBe('ORGANIZATION');
			expect(UserType.MODERATOR).toBe('MODERATOR');
		});
	});

	describe('User Model', () => {
		it('should have user operations available', async () => {
			const { db } = await import('./db');
			expect(db.user).toBeDefined();
			expect(typeof db.user.create).toBe('function');
			expect(typeof db.user.findUnique).toBe('function');
			expect(typeof db.user.findMany).toBe('function');
			expect(typeof db.user.update).toBe('function');
			expect(typeof db.user.delete).toBe('function');
		});
	});

	describe('Session Model', () => {
		it('should have session operations available', async () => {
			const { db } = await import('./db');
			expect(db.session).toBeDefined();
			expect(typeof db.session.create).toBe('function');
			expect(typeof db.session.findUnique).toBe('function');
			expect(typeof db.session.delete).toBe('function');
		});
	});

	describe('EmailVerification Model', () => {
		it('should have email verification operations available', async () => {
			const { db } = await import('./db');
			expect(db.emailVerification).toBeDefined();
			expect(typeof db.emailVerification.create).toBe('function');
			expect(typeof db.emailVerification.findUnique).toBe('function');
			expect(typeof db.emailVerification.delete).toBe('function');
		});
	});

	describe('PasswordReset Model', () => {
		it('should have password reset operations available', async () => {
			const { db } = await import('./db');
			expect(db.passwordReset).toBeDefined();
			expect(typeof db.passwordReset.create).toBe('function');
			expect(typeof db.passwordReset.findUnique).toBe('function');
			expect(typeof db.passwordReset.delete).toBe('function');
		});
	});
});

describe('Schema Validation', () => {
	it('should have correct UserType values', async () => {
		const { UserType } = await import('./db');
		const expectedTypes = ['ANONYMOUS', 'VERIFIED', 'EXPERT', 'PHD', 'ORGANIZATION', 'MODERATOR'];
		expectedTypes.forEach((type) => {
			expect(Object.values(UserType)).toContain(type);
		});
	});
});
