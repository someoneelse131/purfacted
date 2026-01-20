/**
 * T31: Test Database Setup
 *
 * Utilities for test database management including connection, seeding, and cleanup.
 */

import { vi } from 'vitest';

/**
 * Test database configuration
 */
export const TEST_DB_CONFIG = {
	connectionString: process.env.TEST_DATABASE_URL || 'postgresql://purfacted:test@localhost:5433/purfacted_test',
	poolMin: 1,
	poolMax: 5,
	connectionTimeout: 10000
};

/**
 * Creates a mock Prisma client for unit tests
 */
export function createMockPrisma() {
	return {
		user: createMockModel(),
		session: createMockModel(),
		fact: createMockModel(),
		source: createMockModel(),
		vote: createMockModel(),
		category: createMockModel(),
		categoryAlias: createMockModel(),
		comment: createMockModel(),
		discussion: createMockModel(),
		debate: createMockModel(),
		debateMessage: createMockModel(),
		notification: createMockModel(),
		notificationPreference: createMockModel(),
		moderationQueue: createMockModel(),
		ban: createMockModel(),
		ipBan: createMockModel(),
		accountFlag: createMockModel(),
		emailVerification: createMockModel(),
		passwordReset: createMockModel(),
		ipRateLimit: createMockModel(),
		anonymousVote: createMockModel(),
		expertVerification: createMockModel(),
		factEdit: createMockModel(),
		factVeto: createMockModel(),
		userBlock: createMockModel(),
		report: createMockModel(),
		organizationFact: createMockModel(),
		categoryMergeRequest: createMockModel(),
		trustScoreHistory: createMockModel(),
		$connect: vi.fn().mockResolvedValue(undefined),
		$disconnect: vi.fn().mockResolvedValue(undefined),
		$transaction: vi.fn(async (callback: any) => callback(createMockPrisma())),
		$queryRaw: vi.fn().mockResolvedValue([]),
		$executeRaw: vi.fn().mockResolvedValue(0)
	};
}

/**
 * Creates a mock model with common Prisma operations
 */
function createMockModel() {
	return {
		findUnique: vi.fn().mockResolvedValue(null),
		findUniqueOrThrow: vi.fn().mockRejectedValue(new Error('Not found')),
		findFirst: vi.fn().mockResolvedValue(null),
		findFirstOrThrow: vi.fn().mockRejectedValue(new Error('Not found')),
		findMany: vi.fn().mockResolvedValue([]),
		create: vi.fn().mockImplementation(async ({ data }) => ({ id: `mock-${Date.now()}`, ...data })),
		createMany: vi.fn().mockResolvedValue({ count: 0 }),
		update: vi.fn().mockImplementation(async ({ data, where }) => ({ ...where, ...data })),
		updateMany: vi.fn().mockResolvedValue({ count: 0 }),
		upsert: vi.fn().mockImplementation(async ({ create }) => ({ id: `mock-${Date.now()}`, ...create })),
		delete: vi.fn().mockResolvedValue({ id: 'deleted' }),
		deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
		count: vi.fn().mockResolvedValue(0),
		aggregate: vi.fn().mockResolvedValue({}),
		groupBy: vi.fn().mockResolvedValue([])
	};
}

/**
 * Sets up mock for Prisma client import
 */
export function setupPrismaMock() {
	const mockPrisma = createMockPrisma();

	vi.mock('$lib/server/db', () => ({
		prisma: mockPrisma,
		default: mockPrisma
	}));

	return mockPrisma;
}

/**
 * Test data cleanup utilities
 */
export const testCleanup = {
	/**
	 * Clears all mock data from Prisma models
	 */
	clearMocks(prisma: ReturnType<typeof createMockPrisma>) {
		Object.values(prisma).forEach((value) => {
			if (typeof value === 'object' && value !== null) {
				Object.values(value).forEach((fn) => {
					if (typeof fn === 'function' && 'mockClear' in fn) {
						(fn as ReturnType<typeof vi.fn>).mockClear();
					}
				});
			}
		});
	},

	/**
	 * Resets all mock implementations to defaults
	 */
	resetMocks(prisma: ReturnType<typeof createMockPrisma>) {
		Object.values(prisma).forEach((value) => {
			if (typeof value === 'object' && value !== null) {
				Object.values(value).forEach((fn) => {
					if (typeof fn === 'function' && 'mockReset' in fn) {
						(fn as ReturnType<typeof vi.fn>).mockReset();
					}
				});
			}
		});
	}
};

/**
 * Test database seeding utilities
 */
export const testSeed = {
	/**
	 * Seeds a mock user into the test database mock
	 */
	async seedUser(prisma: ReturnType<typeof createMockPrisma>, data: Partial<any> = {}) {
		const user = {
			id: `user-${Date.now()}`,
			email: `test-${Date.now()}@purfacted.com`,
			firstName: 'Test',
			lastName: 'User',
			userType: 'VERIFIED',
			trustScore: 10,
			emailVerified: true,
			banLevel: 0,
			bannedUntil: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			...data
		};

		vi.mocked(prisma.user.findUnique).mockResolvedValue(user);
		vi.mocked(prisma.user.create).mockResolvedValue(user);

		return user;
	},

	/**
	 * Seeds a mock fact into the test database mock
	 */
	async seedFact(prisma: ReturnType<typeof createMockPrisma>, data: Partial<any> = {}) {
		const fact = {
			id: `fact-${Date.now()}`,
			title: 'Test Fact',
			body: 'This is a test fact body.',
			status: 'SUBMITTED',
			upvotes: 0,
			downvotes: 0,
			weightedScore: 0,
			authorId: `user-${Date.now()}`,
			categoryId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			...data
		};

		vi.mocked(prisma.fact.findUnique).mockResolvedValue(fact);
		vi.mocked(prisma.fact.create).mockResolvedValue(fact);

		return fact;
	}
};
