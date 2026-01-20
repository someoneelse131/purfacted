/**
 * Public API Integration Tests
 *
 * Tests for the Source of Trust public API endpoints.
 * These tests hit the REAL database and API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testDb, cleanDatabase, connectTestDb, disconnectTestDb, createTestUser, createTestFact, createTestCategory, createTestSource } from './db-setup';
import crypto from 'crypto';

// Base URL for API requests
const API_BASE = 'http://localhost:3000/api/v1';

// Test API key (will be created in tests)
let testApiKey: string;
let testApiKeyId: string;

/**
 * Generate API key hash (same as production)
 */
function hashApiKey(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a test API key directly in DB
 */
async function createTestApiKey(tier: 'FREE' | 'BASIC' | 'PREMIUM' | 'UNLIMITED' = 'UNLIMITED') {
	const keyBytes = crypto.randomBytes(32);
	const rawKey = `pf_live_${keyBytes.toString('base64url')}`;
	const hash = hashApiKey(rawKey);
	const prefix = rawKey.substring(0, 12);

	const apiKey = await testDb.apiKey.create({
		data: {
			key: hash,
			keyPrefix: prefix,
			name: 'Test API Key',
			email: 'test@example.com',
			tier,
			isActive: true
		}
	});

	return { apiKey, rawKey };
}

/**
 * Helper to make API requests
 */
async function apiRequest(
	path: string,
	options: RequestInit & { apiKey?: string } = {}
): Promise<{ status: number; data: any; headers: Headers }> {
	const { apiKey, ...fetchOptions } = options;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-No-Cache': 'true', // Bypass cache for testing
		...(options.headers as Record<string, string> || {})
	};

	if (apiKey) {
		headers['X-API-Key'] = apiKey;
	}

	const response = await fetch(`${API_BASE}${path}`, {
		...fetchOptions,
		headers
	});

	let data;
	try {
		data = await response.json();
	} catch {
		data = null;
	}

	return { status: response.status, data, headers: response.headers };
}

describe('Public API v1 - Integration Tests', () => {
	beforeAll(async () => {
		await connectTestDb();
		await cleanDatabase();

		// Create a test API key
		const { rawKey, apiKey } = await createTestApiKey();
		testApiKey = rawKey;
		testApiKeyId = apiKey.id;
	}, 30000);

	afterAll(async () => {
		await cleanDatabase();
		await disconnectTestDb();
	}, 30000);

	beforeEach(async () => {
		// Clean data but keep API key
		const tables = [
			'webhook_deliveries', 'webhooks', 'fact_votes', 'sources', 'facts', 'categories', 'users'
		];
		for (const table of tables) {
			try {
				await testDb.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
			} catch {
				// Ignore errors
			}
		}
	}, 30000);

	describe('Authentication', () => {
		it('should reject requests without API key', async () => {
			const { status, data } = await apiRequest('/facts');

			expect(status).toBe(401);
			expect(data.success).toBe(false);
			expect(data.error.code).toBe('INVALID_API_KEY');
		});

		it('should reject requests with invalid API key', async () => {
			const { status, data } = await apiRequest('/facts', {
				apiKey: 'pf_live_invalid_key_12345'
			});

			expect(status).toBe(401);
			expect(data.success).toBe(false);
			expect(data.error.code).toBe('INVALID_API_KEY');
		});

		it('should accept requests with valid API key in header', async () => {
			const { status, data } = await apiRequest('/facts', {
				apiKey: testApiKey
			});

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('should accept API key via Bearer token', async () => {
			const response = await fetch(`${API_BASE}/facts`, {
				headers: {
					'Authorization': `Bearer ${testApiKey}`
				}
			});

			expect(response.status).toBe(200);
		});

		it('should accept API key via query parameter', async () => {
			const response = await fetch(`${API_BASE}/facts?api_key=${testApiKey}`);

			expect(response.status).toBe(200);
		});

		it('should reject expired API key', async () => {
			// Create expired key
			const keyBytes = crypto.randomBytes(32);
			const rawKey = `pf_live_${keyBytes.toString('base64url')}`;
			const hash = hashApiKey(rawKey);

			await testDb.apiKey.create({
				data: {
					key: hash,
					keyPrefix: rawKey.substring(0, 12),
					name: 'Expired Key',
					email: 'expired@example.com',
					tier: 'FREE',
					isActive: true,
					expiresAt: new Date(Date.now() - 86400000) // Yesterday
				}
			});

			const { status, data } = await apiRequest('/facts', { apiKey: rawKey });

			expect(status).toBe(401);
			expect(data.error.code).toBe('EXPIRED_API_KEY');
		});

		it('should reject inactive API key', async () => {
			const keyBytes = crypto.randomBytes(32);
			const rawKey = `pf_live_${keyBytes.toString('base64url')}`;
			const hash = hashApiKey(rawKey);

			await testDb.apiKey.create({
				data: {
					key: hash,
					keyPrefix: rawKey.substring(0, 12),
					name: 'Inactive Key',
					email: 'inactive@example.com',
					tier: 'FREE',
					isActive: false
				}
			});

			const { status, data } = await apiRequest('/facts', { apiKey: rawKey });

			expect(status).toBe(401);
			expect(data.error.code).toBe('INACTIVE_API_KEY');
		});
	});

	describe('GET /api/v1/facts', () => {
		it('should return empty array when no facts exist', async () => {
			const { status, data } = await apiRequest('/facts', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.facts).toEqual([]);
			expect(data.meta.total).toBe(0);
		});

		it('should return facts list', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, title: 'Test Fact 1' });
			await createTestFact({ userId: user.id, title: 'Test Fact 2' });

			const { status, data } = await apiRequest('/facts', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.facts).toHaveLength(2);
			expect(data.meta.total).toBe(2);
		});

		it('should return facts with correct structure', async () => {
			const user = await createTestUser({ firstName: 'John', lastName: 'Doe' });
			const category = await createTestCategory({ name: 'Science' });
			await createTestFact({
				userId: user.id,
				title: 'Climate Change Impact',
				categoryId: category.id
			});

			const { status, data } = await apiRequest('/facts', { apiKey: testApiKey });

			expect(status).toBe(200);
			const fact = data.data.facts[0];

			expect(fact).toHaveProperty('id');
			expect(fact).toHaveProperty('title', 'Climate Change Impact');
			expect(fact).toHaveProperty('body');
			expect(fact).toHaveProperty('status');
			expect(fact).toHaveProperty('createdAt');
			expect(fact).toHaveProperty('category');
			expect(fact.category.name).toBe('Science');
			expect(fact).toHaveProperty('author');
			expect(fact.author.name).toBe('John Doe');
			expect(fact).toHaveProperty('stats');
		});

		it('should filter by status', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, status: 'PROVEN' });
			await createTestFact({ userId: user.id, status: 'SUBMITTED' });
			await createTestFact({ userId: user.id, status: 'PROVEN' });

			const { status, data } = await apiRequest('/facts?status=PROVEN', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.facts).toHaveLength(2);
			expect(data.data.facts.every((f: any) => f.status === 'PROVEN')).toBe(true);
		});

		it('should filter by category', async () => {
			const user = await createTestUser();
			const cat1 = await createTestCategory({ name: 'Tech' });
			const cat2 = await createTestCategory({ name: 'Health' });
			await createTestFact({ userId: user.id, categoryId: cat1.id });
			await createTestFact({ userId: user.id, categoryId: cat2.id });
			await createTestFact({ userId: user.id, categoryId: cat1.id });

			const { status, data } = await apiRequest(`/facts?category=${cat1.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.facts).toHaveLength(2);
		});

		it('should search by query', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, title: 'Climate Change Research' });
			await createTestFact({ userId: user.id, title: 'Economic Policy' });
			await createTestFact({ userId: user.id, title: 'Climate Models' });

			const { status, data } = await apiRequest('/facts?q=climate', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.facts).toHaveLength(2);
		});

		it('should paginate results', async () => {
			const user = await createTestUser();
			for (let i = 0; i < 25; i++) {
				await createTestFact({ userId: user.id, title: `Fact ${i}` });
			}

			const { status, data } = await apiRequest('/facts?page=1&limit=10', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.facts).toHaveLength(10);
			expect(data.meta.page).toBe(1);
			expect(data.meta.limit).toBe(10);
			expect(data.meta.total).toBe(25);
			expect(data.meta.hasMore).toBe(true);

			// Second page
			const page2 = await apiRequest('/facts?page=2&limit=10', { apiKey: testApiKey });
			expect(page2.data.data.facts).toHaveLength(10);
			expect(page2.data.meta.page).toBe(2);
		});

		it('should reject invalid status', async () => {
			const { status, data } = await apiRequest('/facts?status=INVALID', { apiKey: testApiKey });

			expect(status).toBe(400);
			expect(data.error.code).toBe('INVALID_STATUS');
		});

		it('should include rate limit headers', async () => {
			const { headers } = await apiRequest('/facts', { apiKey: testApiKey });

			expect(headers.get('X-RateLimit-Limit')).toBeDefined();
			expect(headers.get('X-RateLimit-Remaining')).toBeDefined();
			expect(headers.get('X-RateLimit-Reset')).toBeDefined();
		});
	});

	describe('GET /api/v1/facts/:id', () => {
		it('should return 404 for non-existent fact', async () => {
			const { status, data } = await apiRequest('/facts/nonexistent-id', { apiKey: testApiKey });

			expect(status).toBe(404);
			expect(data.error.code).toBe('NOT_FOUND');
		});

		it('should return fact details', async () => {
			const user = await createTestUser({ firstName: 'Jane', lastName: 'Smith', trustScore: 50 });
			const category = await createTestCategory({ name: 'Technology' });
			const fact = await createTestFact({
				userId: user.id,
				title: 'AI Research Findings',
				categoryId: category.id,
				status: 'PROVEN'
			});

			const { status, data } = await apiRequest(`/facts/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.id).toBe(fact.id);
			expect(data.data.title).toBe('AI Research Findings');
			expect(data.data.status).toBe('PROVEN');
			expect(data.data.category.name).toBe('Technology');
			expect(data.data.author.name).toBe('Jane Smith');
			expect(data.data.author.trustScore).toBe(50);
		});

		it('should include sources with credibility', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({
				factId: fact.id,
				url: 'https://nature.com/article',
				title: 'Nature Article',
				type: 'PEER_REVIEWED',
				credibilityScore: 90
			});
			await createTestSource({
				factId: fact.id,
				url: 'https://blog.com/post',
				title: 'Blog Post',
				type: 'BLOG',
				credibilityScore: 30
			});

			const { status, data } = await apiRequest(`/facts/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources).toHaveLength(2);
			expect(data.data.sources[0].credibility).toBe(90); // Sorted by credibility
			expect(data.data.sources[0].type).toBe('PEER_REVIEWED');
			expect(data.data.trust.averageSourceCredibility).toBe(60);
		});

		it('should include vote statistics', async () => {
			const author = await createTestUser({ email: 'author@test.com' });
			const voter1 = await createTestUser({ email: 'voter1@test.com' });
			const voter2 = await createTestUser({ email: 'voter2@test.com' });
			const voter3 = await createTestUser({ email: 'voter3@test.com' });
			const fact = await createTestFact({ userId: author.id });

			// Create votes
			await testDb.factVote.createMany({
				data: [
					{ factId: fact.id, userId: voter1.id, value: 1, weight: 2.0 },
					{ factId: fact.id, userId: voter2.id, value: 1, weight: 1.5 },
					{ factId: fact.id, userId: voter3.id, value: -1, weight: 1.0 }
				]
			});

			const { status, data } = await apiRequest(`/facts/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.trust.totalVotes).toBe(3);
			expect(data.data.trust.upvotes).toBe(2);
			expect(data.data.trust.downvotes).toBe(1);
			expect(data.data.trust.weightedScore).toBeCloseTo(2.5); // (2.0 + 1.5 - 1.0)
			expect(data.data.trust.upvotePercentage).toBe(67);
		});

		it('should include category hierarchy', async () => {
			const parentCat = await createTestCategory({ name: 'Science' });
			const childCat = await createTestCategory({ name: 'Physics', parentId: parentCat.id });
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id, categoryId: childCat.id });

			const { status, data } = await apiRequest(`/facts/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.category.name).toBe('Physics');
			expect(data.data.category.parent.name).toBe('Science');
		});
	});

	describe('Rate Limiting', () => {
		it('should track API usage', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id });

			// Make a request
			await apiRequest('/facts', { apiKey: testApiKey });

			// Check usage was recorded
			const usage = await testDb.apiUsage.findMany({
				where: { apiKeyId: testApiKeyId }
			});

			expect(usage.length).toBeGreaterThan(0);
			expect(usage[0].endpoint).toBe('/api/v1/facts');
			expect(usage[0].method).toBe('GET');
			expect(usage[0].status).toBe(200);
		});

		it('should enforce rate limits for FREE tier', async () => {
			// Create a FREE tier key
			const { rawKey, apiKey } = await createTestApiKey('FREE');

			// Set rate limit to near exhaustion
			await testDb.apiRateLimit.create({
				data: {
					apiKeyId: apiKey.id,
					requests: 99, // One request left
					resetAt: new Date(Date.now() + 86400000) // Tomorrow
				}
			});

			// First request should succeed
			const { status: status1 } = await apiRequest('/facts', { apiKey: rawKey });
			expect(status1).toBe(200);

			// Second request should be rate limited
			const { status: status2, data: data2 } = await apiRequest('/facts', { apiKey: rawKey });
			expect(status2).toBe(429);
			expect(data2.error.code).toBe('RATE_LIMITED');
		});
	});

	describe('API Key Management', () => {
		it('should update lastUsedAt on valid request', async () => {
			const { rawKey, apiKey } = await createTestApiKey();

			// Make request
			await apiRequest('/facts', { apiKey: rawKey });

			// Wait a moment for async update
			await new Promise(r => setTimeout(r, 100));

			// Check lastUsedAt was updated
			const updated = await testDb.apiKey.findUnique({
				where: { id: apiKey.id }
			});

			expect(updated?.lastUsedAt).not.toBeNull();
		});
	});

	describe('GET /api/v1/sources', () => {
		it('should return empty array when no sources exist', async () => {
			const { status, data } = await apiRequest('/sources', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.sources).toEqual([]);
			expect(data.meta.total).toBe(0);
		});

		it('should return sources list', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({ factId: fact.id, title: 'Source 1' });
			await createTestSource({ factId: fact.id, title: 'Source 2' });

			const { status, data } = await apiRequest('/sources', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.sources).toHaveLength(2);
			expect(data.meta.total).toBe(2);
		});

		it('should return sources with correct structure', async () => {
			const user = await createTestUser({ firstName: 'John', lastName: 'Doe' });
			const fact = await createTestFact({ userId: user.id, title: 'Climate Fact' });
			await createTestSource({
				factId: fact.id,
				url: 'https://example.com/paper',
				title: 'Research Paper',
				type: 'PEER_REVIEWED',
				credibilityScore: 85
			});

			const { status, data } = await apiRequest('/sources', { apiKey: testApiKey });

			expect(status).toBe(200);
			const source = data.data.sources[0];

			expect(source).toHaveProperty('id');
			expect(source).toHaveProperty('url', 'https://example.com/paper');
			expect(source).toHaveProperty('title', 'Research Paper');
			expect(source).toHaveProperty('type', 'PEER_REVIEWED');
			expect(source).toHaveProperty('credibility', 85);
			expect(source).toHaveProperty('addedAt');
			expect(source).toHaveProperty('fact');
			expect(source.fact.title).toBe('Climate Fact');
			expect(source).toHaveProperty('addedBy');
			expect(source.addedBy.name).toBe('John Doe');
		});

		it('should filter by factId', async () => {
			const user = await createTestUser();
			const fact1 = await createTestFact({ userId: user.id, title: 'Fact 1' });
			const fact2 = await createTestFact({ userId: user.id, title: 'Fact 2' });
			await createTestSource({ factId: fact1.id });
			await createTestSource({ factId: fact1.id });
			await createTestSource({ factId: fact2.id });

			const { status, data } = await apiRequest(`/sources?factId=${fact1.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources).toHaveLength(2);
			expect(data.data.sources.every((s: any) => s.fact.id === fact1.id)).toBe(true);
		});

		it('should filter by type', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({ factId: fact.id, type: 'PEER_REVIEWED' });
			await createTestSource({ factId: fact.id, type: 'NEWS' });
			await createTestSource({ factId: fact.id, type: 'PEER_REVIEWED' });

			const { status, data } = await apiRequest('/sources?type=PEER_REVIEWED', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources).toHaveLength(2);
			expect(data.data.sources.every((s: any) => s.type === 'PEER_REVIEWED')).toBe(true);
		});

		it('should filter by minimum credibility', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({ factId: fact.id, credibilityScore: 30 });
			await createTestSource({ factId: fact.id, credibilityScore: 60 });
			await createTestSource({ factId: fact.id, credibilityScore: 90 });

			const { status, data } = await apiRequest('/sources?minCredibility=50', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources).toHaveLength(2);
			expect(data.data.sources.every((s: any) => s.credibility >= 50)).toBe(true);
		});

		it('should paginate results', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			for (let i = 0; i < 15; i++) {
				await createTestSource({ factId: fact.id, title: `Source ${i}` });
			}

			const { status, data } = await apiRequest('/sources?page=1&limit=10', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources).toHaveLength(10);
			expect(data.meta.page).toBe(1);
			expect(data.meta.limit).toBe(10);
			expect(data.meta.total).toBe(15);
			expect(data.meta.hasMore).toBe(true);
		});

		it('should reject invalid source type', async () => {
			const { status, data } = await apiRequest('/sources?type=INVALID', { apiKey: testApiKey });

			expect(status).toBe(400);
			expect(data.error.code).toBe('INVALID_SOURCE_TYPE');
		});

		it('should reject invalid credibility value', async () => {
			const { status, data } = await apiRequest('/sources?minCredibility=abc', { apiKey: testApiKey });

			expect(status).toBe(400);
			expect(data.error.code).toBe('INVALID_CREDIBILITY');
		});
	});

	describe('GET /api/v1/sources/:id', () => {
		it('should return 404 for non-existent source', async () => {
			const { status, data } = await apiRequest('/sources/nonexistent-id', { apiKey: testApiKey });

			expect(status).toBe(404);
			expect(data.error.code).toBe('NOT_FOUND');
		});

		it('should return source details', async () => {
			const user = await createTestUser({ firstName: 'Jane', lastName: 'Smith', trustScore: 75 });
			const category = await createTestCategory({ name: 'Science' });
			const fact = await createTestFact({
				userId: user.id,
				title: 'Important Discovery',
				categoryId: category.id
			});
			const source = await createTestSource({
				factId: fact.id,
				url: 'https://nature.com/article',
				title: 'Nature Article',
				type: 'PEER_REVIEWED',
				credibilityScore: 95
			});

			const { status, data } = await apiRequest(`/sources/${source.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.id).toBe(source.id);
			expect(data.data.url).toBe('https://nature.com/article');
			expect(data.data.title).toBe('Nature Article');
			expect(data.data.type).toBe('PEER_REVIEWED');
			expect(data.data.credibility).toBe(95);
		});

		it('should include associated fact information', async () => {
			const user = await createTestUser({ firstName: 'Test', lastName: 'Author' });
			const category = await createTestCategory({ name: 'Technology' });
			const fact = await createTestFact({
				userId: user.id,
				title: 'Tech Fact',
				body: 'This is about technology.',
				categoryId: category.id,
				status: 'PROVEN'
			});
			const source = await createTestSource({ factId: fact.id });

			const { status, data } = await apiRequest(`/sources/${source.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.fact.id).toBe(fact.id);
			expect(data.data.fact.title).toBe('Tech Fact');
			expect(data.data.fact.status).toBe('PROVEN');
			expect(data.data.fact.category.name).toBe('Technology');
			expect(data.data.fact.author.name).toBe('Test Author');
		});

		it('should include who added the source', async () => {
			const factAuthor = await createTestUser({ email: 'author@test.com', firstName: 'Fact', lastName: 'Author' });
			const sourceAdder = await createTestUser({
				email: 'adder@test.com',
				firstName: 'Source',
				lastName: 'Adder',
				trustScore: 80
			});
			const fact = await createTestFact({ userId: factAuthor.id });
			const source = await createTestSource({
				factId: fact.id,
				addedById: sourceAdder.id
			});

			const { status, data } = await apiRequest(`/sources/${source.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.addedBy.id).toBe(sourceAdder.id);
			expect(data.data.addedBy.name).toBe('Source Adder');
			expect(data.data.addedBy.trustScore).toBe(80);
		});
	});

	describe('GET /api/v1/categories', () => {
		it('should return empty array when no categories exist', async () => {
			const { status, data } = await apiRequest('/categories', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.categories).toEqual([]);
			expect(data.meta.total).toBe(0);
		});

		it('should return categories list', async () => {
			await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Technology' });
			await createTestCategory({ name: 'Health' });

			const { status, data } = await apiRequest('/categories', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.categories).toHaveLength(3);
			expect(data.meta.total).toBe(3);
		});

		it('should return categories with correct structure', async () => {
			const parent = await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Physics', parentId: parent.id });

			const { status, data } = await apiRequest('/categories', { apiKey: testApiKey });

			expect(status).toBe(200);
			const physics = data.data.categories.find((c: any) => c.name === 'Physics');

			expect(physics).toHaveProperty('id');
			expect(physics).toHaveProperty('name', 'Physics');
			expect(physics).toHaveProperty('parentId', parent.id);
			expect(physics).toHaveProperty('parent');
			expect(physics.parent.name).toBe('Science');
			expect(physics).toHaveProperty('stats');
			expect(physics.stats).toHaveProperty('facts');
			expect(physics.stats).toHaveProperty('subcategories');
		});

		it('should search by query', async () => {
			await createTestCategory({ name: 'Climate Science' });
			await createTestCategory({ name: 'Computer Science' });
			await createTestCategory({ name: 'Health' });

			const { status, data } = await apiRequest('/categories?q=science', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.categories).toHaveLength(2);
			expect(data.data.categories.every((c: any) =>
				c.name.toLowerCase().includes('science')
			)).toBe(true);
		});

		it('should filter by root categories', async () => {
			const parent1 = await createTestCategory({ name: 'Science' });
			const parent2 = await createTestCategory({ name: 'Technology' });
			await createTestCategory({ name: 'Physics', parentId: parent1.id });
			await createTestCategory({ name: 'AI', parentId: parent2.id });

			const { status, data } = await apiRequest('/categories?parent=root', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.categories).toHaveLength(2);
			expect(data.data.categories.every((c: any) => c.parentId === null)).toBe(true);
		});

		it('should filter by parent ID', async () => {
			const parent = await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Physics', parentId: parent.id });
			await createTestCategory({ name: 'Chemistry', parentId: parent.id });
			await createTestCategory({ name: 'Technology' }); // Not a child

			const { status, data } = await apiRequest(`/categories?parent=${parent.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.categories).toHaveLength(2);
			expect(data.data.categories.every((c: any) => c.parentId === parent.id)).toBe(true);
		});

		it('should paginate results', async () => {
			for (let i = 0; i < 15; i++) {
				await createTestCategory({ name: `Category ${i.toString().padStart(2, '0')}` });
			}

			const { status, data } = await apiRequest('/categories?page=1&limit=10', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.categories).toHaveLength(10);
			expect(data.meta.page).toBe(1);
			expect(data.meta.total).toBe(15);
			expect(data.meta.hasMore).toBe(true);
		});
	});

	describe('GET /api/v1/categories/:id', () => {
		it('should return 404 for non-existent category', async () => {
			const { status, data } = await apiRequest('/categories/nonexistent-id', { apiKey: testApiKey });

			expect(status).toBe(404);
			expect(data.error.code).toBe('NOT_FOUND');
		});

		it('should return category details', async () => {
			const category = await createTestCategory({ name: 'Science' });

			const { status, data } = await apiRequest(`/categories/${category.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.id).toBe(category.id);
			expect(data.data.name).toBe('Science');
		});

		it('should include breadcrumb path', async () => {
			const grandparent = await createTestCategory({ name: 'Science' });
			const parent = await createTestCategory({ name: 'Physics', parentId: grandparent.id });
			const category = await createTestCategory({ name: 'Quantum', parentId: parent.id });

			const { status, data } = await apiRequest(`/categories/${category.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.breadcrumb).toHaveLength(3);
			expect(data.data.breadcrumb[0].name).toBe('Science');
			expect(data.data.breadcrumb[1].name).toBe('Physics');
			expect(data.data.breadcrumb[2].name).toBe('Quantum');
		});

		it('should include children categories', async () => {
			const parent = await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Physics', parentId: parent.id });
			await createTestCategory({ name: 'Chemistry', parentId: parent.id });
			await createTestCategory({ name: 'Biology', parentId: parent.id });

			const { status, data } = await apiRequest(`/categories/${parent.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.children).toHaveLength(3);
			expect(data.data.children.map((c: any) => c.name).sort()).toEqual(['Biology', 'Chemistry', 'Physics']);
		});

		it('should include fact count', async () => {
			const user = await createTestUser();
			const category = await createTestCategory({ name: 'Technology' });
			await createTestFact({ userId: user.id, categoryId: category.id });
			await createTestFact({ userId: user.id, categoryId: category.id });
			await createTestFact({ userId: user.id, categoryId: category.id });

			const { status, data } = await apiRequest(`/categories/${category.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.stats.facts).toBe(3);
		});
	});

	describe('GET /api/v1/categories/tree', () => {
		it('should return empty tree when no categories exist', async () => {
			const { status, data } = await apiRequest('/categories/tree', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.tree).toEqual([]);
			expect(data.data.stats.totalCategories).toBe(0);
		});

		it('should return hierarchical tree structure', async () => {
			const science = await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Physics', parentId: science.id });
			await createTestCategory({ name: 'Chemistry', parentId: science.id });
			const tech = await createTestCategory({ name: 'Technology' });
			await createTestCategory({ name: 'AI', parentId: tech.id });

			const { status, data } = await apiRequest('/categories/tree', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.tree).toHaveLength(2); // 2 root categories
			expect(data.data.stats.totalCategories).toBe(5);
			expect(data.data.stats.rootCategories).toBe(2);

			const scienceNode = data.data.tree.find((n: any) => n.name === 'Science');
			expect(scienceNode.children).toHaveLength(2);
		});

		it('should include fact counts at each level', async () => {
			const user = await createTestUser();
			const parent = await createTestCategory({ name: 'Science' });
			const child = await createTestCategory({ name: 'Physics', parentId: parent.id });

			// Add facts to both
			await createTestFact({ userId: user.id, categoryId: parent.id });
			await createTestFact({ userId: user.id, categoryId: child.id });
			await createTestFact({ userId: user.id, categoryId: child.id });

			const { status, data } = await apiRequest('/categories/tree', { apiKey: testApiKey });

			expect(status).toBe(200);
			const scienceNode = data.data.tree.find((n: any) => n.name === 'Science');
			expect(scienceNode.factCount).toBe(1);
			expect(scienceNode.totalFactCount).toBe(3); // 1 + 2 from child
			expect(scienceNode.children[0].factCount).toBe(2);
		});

		it('should return sorted tree', async () => {
			await createTestCategory({ name: 'Zebra' });
			await createTestCategory({ name: 'Alpha' });
			await createTestCategory({ name: 'Beta' });

			const { status, data } = await apiRequest('/categories/tree', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.tree[0].name).toBe('Alpha');
			expect(data.data.tree[1].name).toBe('Beta');
			expect(data.data.tree[2].name).toBe('Zebra');
		});
	});

	describe('GET /api/v1/trust/:factId', () => {
		it('should return 404 for non-existent fact', async () => {
			const { status, data } = await apiRequest('/trust/nonexistent-id', { apiKey: testApiKey });

			expect(status).toBe(404);
			expect(data.error.code).toBe('NOT_FOUND');
		});

		it('should return trust metrics for a fact', async () => {
			const user = await createTestUser({ firstName: 'John', lastName: 'Doe', trustScore: 50 });
			const fact = await createTestFact({ userId: user.id, status: 'PROVEN' });

			const { status, data } = await apiRequest(`/trust/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.factId).toBe(fact.id);
			expect(data.data.status).toBe('PROVEN');
			expect(data.data.author).toBeDefined();
			expect(data.data.author.name).toBe('John Doe');
			expect(data.data.author.trustScore).toBe(50);
		});

		it('should include vote statistics', async () => {
			const author = await createTestUser({ email: 'author@test.com' });
			const voter1 = await createTestUser({ email: 'voter1@test.com', userType: 'EXPERT' });
			const voter2 = await createTestUser({ email: 'voter2@test.com', userType: 'VERIFIED' });
			const voter3 = await createTestUser({ email: 'voter3@test.com', userType: 'VERIFIED' });
			const fact = await createTestFact({ userId: author.id });

			// Create votes
			await testDb.factVote.createMany({
				data: [
					{ factId: fact.id, userId: voter1.id, value: 1, weight: 5.0 },
					{ factId: fact.id, userId: voter2.id, value: 1, weight: 2.0 },
					{ factId: fact.id, userId: voter3.id, value: -1, weight: 2.0 }
				]
			});

			const { status, data } = await apiRequest(`/trust/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.votes.total).toBe(3);
			expect(data.data.votes.upvotes).toBe(2);
			expect(data.data.votes.downvotes).toBe(1);
			expect(data.data.votes.weightedScore).toBeCloseTo(5); // 5 + 2 - 2 = 5
			expect(data.data.votes.upvotePercentage).toBe(67);
			expect(data.data.votes.byUserType).toBeDefined();
		});

		it('should include source statistics', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({ factId: fact.id, type: 'PEER_REVIEWED', credibilityScore: 90 });
			await createTestSource({ factId: fact.id, type: 'PEER_REVIEWED', credibilityScore: 85 });
			await createTestSource({ factId: fact.id, type: 'NEWS', credibilityScore: 60 });

			const { status, data } = await apiRequest(`/trust/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources.count).toBe(3);
			expect(data.data.sources.averageCredibility).toBe(78); // (90 + 85 + 60) / 3 = 78.33
			expect(data.data.sources.byType).toBeDefined();
			expect(data.data.sources.byType.PEER_REVIEWED.count).toBe(2);
			expect(data.data.sources.byType.NEWS.count).toBe(1);
		});

		it('should include trust confidence metric', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const { status, data } = await apiRequest(`/trust/${fact.id}`, { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.trustMetrics).toBeDefined();
			expect(data.data.trustMetrics.confidence).toBeGreaterThanOrEqual(0);
			expect(data.data.trustMetrics.confidence).toBeLessThanOrEqual(100);
		});
	});

	describe('POST /api/v1/trust/batch', () => {
		it('should return trust metrics for multiple facts', async () => {
			const user = await createTestUser();
			const fact1 = await createTestFact({ userId: user.id, status: 'PROVEN' });
			const fact2 = await createTestFact({ userId: user.id, status: 'SUBMITTED' });
			const fact3 = await createTestFact({ userId: user.id, status: 'CONTROVERSIAL' });

			const response = await fetch(`${API_BASE}/trust/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': testApiKey
				},
				body: JSON.stringify({
					factIds: [fact1.id, fact2.id, fact3.id]
				})
			});

			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.found).toBe(3);
			expect(data.data.trust[fact1.id]).toBeDefined();
			expect(data.data.trust[fact1.id].status).toBe('PROVEN');
			expect(data.data.trust[fact2.id].status).toBe('SUBMITTED');
			expect(data.data.trust[fact3.id].status).toBe('CONTROVERSIAL');
		});

		it('should handle non-existent fact IDs', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const response = await fetch(`${API_BASE}/trust/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': testApiKey
				},
				body: JSON.stringify({
					factIds: [fact.id, 'nonexistent-1', 'nonexistent-2']
				})
			});

			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.data.found).toBe(1);
			expect(data.data.notFound).toEqual(['nonexistent-1', 'nonexistent-2']);
		});

		it('should reject empty factIds array', async () => {
			const response = await fetch(`${API_BASE}/trust/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': testApiKey
				},
				body: JSON.stringify({
					factIds: []
				})
			});

			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error.code).toBe('INVALID_INPUT');
		});

		it('should reject batch size over 100', async () => {
			const factIds = Array.from({ length: 101 }, (_, i) => `fact-${i}`);

			const response = await fetch(`${API_BASE}/trust/batch`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': testApiKey
				},
				body: JSON.stringify({ factIds })
			});

			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error.code).toBe('BATCH_TOO_LARGE');
		});
	});

	describe('GET /api/v1/trust/stats', () => {
		it('should return platform statistics', async () => {
			const { status, data } = await apiRequest('/trust/stats', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.facts).toBeDefined();
			expect(data.data.sources).toBeDefined();
			expect(data.data.votes).toBeDefined();
			expect(data.data.vetos).toBeDefined();
			expect(data.data.participation).toBeDefined();
			expect(data.data.recentActivity).toBeDefined();
			expect(data.data.generatedAt).toBeDefined();
		});

		it('should include facts by status', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, status: 'PROVEN' });
			await createTestFact({ userId: user.id, status: 'PROVEN' });
			await createTestFact({ userId: user.id, status: 'SUBMITTED' });

			const { status, data } = await apiRequest('/trust/stats', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.facts.total).toBe(3);
			expect(data.data.facts.byStatus.PROVEN).toBe(2);
			expect(data.data.facts.byStatus.SUBMITTED).toBe(1);
		});

		it('should include source credibility statistics', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			await createTestSource({ factId: fact.id, credibilityScore: 80 });
			await createTestSource({ factId: fact.id, credibilityScore: 60 });
			await createTestSource({ factId: fact.id, credibilityScore: 100 });

			const { status, data } = await apiRequest('/trust/stats', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.sources.total).toBe(3);
			expect(data.data.sources.credibility.average).toBe(80); // (80 + 60 + 100) / 3 = 80
			expect(data.data.sources.credibility.min).toBe(60);
			expect(data.data.sources.credibility.max).toBe(100);
		});

		it('should include recent activity', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id });

			const { status, data } = await apiRequest('/trust/stats', { apiKey: testApiKey });

			expect(status).toBe(200);
			expect(data.data.recentActivity.period).toBe('7 days');
			expect(data.data.recentActivity.newFacts).toBeGreaterThanOrEqual(0);
		});
	});

	describe('Webhooks API', () => {
		describe('GET /api/v1/webhooks', () => {
			it('should return empty array when no webhooks exist', async () => {
				const { status, data } = await apiRequest('/webhooks', { apiKey: testApiKey });

				expect(status).toBe(200);
				expect(data.success).toBe(true);
				expect(data.data.webhooks).toEqual([]);
			});
		});

		describe('POST /api/v1/webhooks', () => {
			it('should create a webhook subscription', async () => {
				const response = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook',
						events: ['fact.created', 'fact.status_changed']
					})
				});

				const data = await response.json();

				expect(response.status).toBe(201);
				expect(data.success).toBe(true);
				expect(data.data.id).toBeDefined();
				expect(data.data.url).toBe('https://example.com/webhook');
				expect(data.data.events).toEqual(['fact.created', 'fact.status_changed']);
				expect(data.data.secret).toBeDefined(); // Secret only returned at creation
				expect(data.data.secret.length).toBe(64); // 32 bytes as hex
				expect(data.data.isActive).toBe(true);
			});

			it('should reject invalid URL', async () => {
				const response = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'not-a-valid-url',
						events: ['fact.created']
					})
				});

				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error.code).toBe('INVALID_URL');
			});

			it('should reject invalid events', async () => {
				const response = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook',
						events: ['invalid.event']
					})
				});

				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error.code).toBe('INVALID_EVENTS');
			});

			it('should reject empty events array', async () => {
				const response = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook',
						events: []
					})
				});

				const data = await response.json();

				expect(response.status).toBe(400);
				expect(data.error.code).toBe('INVALID_EVENTS');
			});
		});

		describe('GET /api/v1/webhooks/:id', () => {
			it('should return webhook details', async () => {
				// First create a webhook
				const createResponse = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook-detail',
						events: ['fact.voted']
					})
				});

				const created = await createResponse.json();
				const webhookId = created.data.id;

				// Now get details
				const { status, data } = await apiRequest(`/webhooks/${webhookId}`, { apiKey: testApiKey });

				expect(status).toBe(200);
				expect(data.data.id).toBe(webhookId);
				expect(data.data.url).toBe('https://example.com/webhook-detail');
				expect(data.data.events).toEqual(['fact.voted']);
				expect(data.data.recentDeliveries).toBeDefined();
			});

			it('should return 404 for non-existent webhook', async () => {
				const { status, data } = await apiRequest('/webhooks/nonexistent-id', { apiKey: testApiKey });

				expect(status).toBe(404);
				expect(data.error.code).toBe('NOT_FOUND');
			});
		});

		describe('PATCH /api/v1/webhooks/:id', () => {
			it('should update webhook', async () => {
				// Create a webhook
				const createResponse = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook-update',
						events: ['fact.created']
					})
				});

				const created = await createResponse.json();
				const webhookId = created.data.id;

				// Update the webhook
				const updateResponse = await fetch(`${API_BASE}/webhooks/${webhookId}`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook-updated',
						events: ['fact.created', 'fact.updated'],
						isActive: false
					})
				});

				const data = await updateResponse.json();

				expect(updateResponse.status).toBe(200);
				expect(data.data.url).toBe('https://example.com/webhook-updated');
				expect(data.data.events).toEqual(['fact.created', 'fact.updated']);
				expect(data.data.isActive).toBe(false);
			});
		});

		describe('DELETE /api/v1/webhooks/:id', () => {
			it('should delete webhook', async () => {
				// Create a webhook
				const createResponse = await fetch(`${API_BASE}/webhooks`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					},
					body: JSON.stringify({
						url: 'https://example.com/webhook-delete',
						events: ['fact.created']
					})
				});

				const created = await createResponse.json();
				const webhookId = created.data.id;

				// Delete the webhook
				const deleteResponse = await fetch(`${API_BASE}/webhooks/${webhookId}`, {
					method: 'DELETE',
					headers: {
						'X-API-Key': testApiKey,
						'X-No-Cache': 'true'
					}
				});

				const data = await deleteResponse.json();

				expect(deleteResponse.status).toBe(200);
				expect(data.data.deleted).toBe(true);

				// Verify it's deleted
				const { status } = await apiRequest(`/webhooks/${webhookId}`, { apiKey: testApiKey });
				expect(status).toBe(404);
			});
		});
	});
});
