/**
 * Real Database Integration Test Setup
 *
 * This module provides utilities for running tests against a REAL database.
 * Tests using this will actually hit PostgreSQL, not mocks.
 */

import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach } from 'vitest';

// Use main database for integration tests (inside Docker)
// We clean up before/after tests to avoid polluting data
const TEST_DATABASE_URL = process.env.DATABASE_URL ||
	'postgresql://purfacted:purfacted@postgres:5432/purfacted';

// Create a dedicated Prisma client for tests
export const testDb = new PrismaClient({
	datasources: {
		db: {
			url: TEST_DATABASE_URL
		}
	},
	log: process.env.DEBUG_SQL ? ['query', 'error', 'warn'] : ['error']
});

/**
 * Tables to clean in order (respects foreign keys)
 */
const TABLES_TO_CLEAN = [
	'debate_votes',
	'debate_messages',
	'debates',
	'comment_votes',
	'comments',
	'discussion_votes',
	'discussions',
	'veto_votes',
	'vetos',
	'fact_votes',
	'anonymous_votes',
	'sources',
	'fact_edits',
	'organization_tags',
	'official_comments',
	'facts',
	'category_merge_votes',
	'category_merge_requests',
	'category_aliases',
	'categories',
	'notification_preferences',
	'notifications',
	'moderation_actions',
	'moderation_queue',
	'verification_reviews',
	'expert_verifications',
	'user_blocks',
	'user_trust_votes',
	'password_resets',
	'email_verifications',
	'sessions',
	'ip_rate_limits',
	'vote_weight_config',
	'trust_modifier_config',
	'trust_score_config',
	'source_credibility_config',
	'users'
];

/**
 * Clean all test data from database
 */
export async function cleanDatabase(): Promise<void> {
	// Use raw SQL for faster cleanup with CASCADE
	for (const table of TABLES_TO_CLEAN) {
		try {
			await testDb.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
		} catch (e: any) {
			// Table might not exist yet, that's OK (code 42P01 = undefined_table)
			if (e?.code !== 'P2010' && !e?.message?.includes('does not exist')) {
				// Only log unexpected errors
				// console.warn(`Warning cleaning ${table}:`, e.message);
			}
		}
	}
}

/**
 * Connect to test database
 */
export async function connectTestDb(): Promise<void> {
	await testDb.$connect();
}

/**
 * Disconnect from test database
 */
export async function disconnectTestDb(): Promise<void> {
	await testDb.$disconnect();
}

/**
 * Setup hooks for integration tests
 * Call this in your test file's describe block
 */
export function setupIntegrationTest() {
	beforeAll(async () => {
		await connectTestDb();
		await cleanDatabase();
	}, 30000); // 30 second timeout

	afterAll(async () => {
		await cleanDatabase();
		await disconnectTestDb();
	}, 30000); // 30 second timeout

	beforeEach(async () => {
		await cleanDatabase();
	}, 30000); // 30 second timeout
}

/**
 * Create a test user directly in DB
 */
export async function createTestUser(data: {
	email?: string;
	firstName?: string;
	lastName?: string;
	passwordHash?: string;
	userType?: 'ANONYMOUS' | 'VERIFIED' | 'EXPERT' | 'PHD' | 'ORGANIZATION' | 'MODERATOR';
	trustScore?: number;
	emailVerified?: boolean;
} = {}) {
	return testDb.user.create({
		data: {
			email: data.email || `test-${Date.now()}@test.com`,
			firstName: data.firstName || 'Test',
			lastName: data.lastName || 'User',
			passwordHash: data.passwordHash || '$argon2id$v=19$m=65536,t=3,p=4$test',
			userType: data.userType || 'VERIFIED',
			trustScore: data.trustScore ?? 10,
			emailVerified: data.emailVerified ?? true
		}
	});
}

/**
 * Create a test category directly in DB
 */
export async function createTestCategory(data: {
	name?: string;
	parentId?: string;
} = {}) {
	const name = data.name || `Category-${Date.now()}`;
	return testDb.category.create({
		data: {
			name,
			parentId: data.parentId
		}
	});
}

/**
 * Create a test fact directly in DB
 */
export async function createTestFact(data: {
	title?: string;
	body?: string;
	userId: string;
	categoryId?: string;
	status?: 'SUBMITTED' | 'IN_REVIEW' | 'PROVEN' | 'DISPROVEN' | 'CONTROVERSIAL' | 'UNDER_VETO_REVIEW';
} ) {
	return testDb.fact.create({
		data: {
			title: data.title || `Test Fact ${Date.now()}`,
			body: data.body || 'This is a test fact with sufficient content for validation purposes.',
			userId: data.userId,
			categoryId: data.categoryId,
			status: data.status || 'SUBMITTED'
		}
	});
}

/**
 * Create a test source directly in DB
 */
export async function createTestSource(data: {
	url?: string;
	title?: string;
	factId: string;
	addedById?: string;
	type?: 'PEER_REVIEWED' | 'OFFICIAL' | 'NEWS' | 'COMPANY' | 'BLOG' | 'OTHER';
	credibilityScore?: number;
}) {
	// If no addedById provided, we need to get the fact's userId
	let addedById = data.addedById;
	if (!addedById) {
		const fact = await testDb.fact.findUnique({ where: { id: data.factId } });
		addedById = fact?.userId || '';
	}
	return testDb.source.create({
		data: {
			url: data.url || `https://example.com/source-${Date.now()}`,
			title: data.title || 'Test Source',
			factId: data.factId,
			addedById,
			type: data.type || 'NEWS',
			credibility: data.credibilityScore ?? 50
		}
	});
}

export { testDb as db };
