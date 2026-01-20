/**
 * API Endpoint Integration Tests
 *
 * These tests hit REAL API endpoints - no mocks!
 * Tests run against the actual database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testDb, cleanDatabase, connectTestDb, disconnectTestDb, createTestUser, createTestFact, createTestCategory } from './db-setup';

// Base URL for API requests - use the app container's internal address
const API_BASE = 'http://localhost:3000/api';

// Helper to make API requests
async function apiRequest(
	path: string,
	options: RequestInit = {}
): Promise<{ status: number; data: any; headers: Headers }> {
	const response = await fetch(`${API_BASE}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		}
	});

	let data;
	try {
		data = await response.json();
	} catch {
		data = null;
	}

	return { status: response.status, data, headers: response.headers };
}

describe('API Endpoints - Real Integration', () => {
	beforeAll(async () => {
		await connectTestDb();
		await cleanDatabase();
	}, 30000);

	afterAll(async () => {
		await cleanDatabase();
		await disconnectTestDb();
	}, 30000);

	beforeEach(async () => {
		await cleanDatabase();
	}, 30000);

	describe('Health Endpoint', () => {
		it('should return healthy status', async () => {
			const { status, data } = await apiRequest('/health');

			expect(status).toBe(200);
			expect(data.status).toBe('ok');
		});
	});

	describe('Categories API', () => {
		it('GET /api/categories should return categories', async () => {
			// Create some categories in DB
			await createTestCategory({ name: 'Science' });
			await createTestCategory({ name: 'Politics' });

			const { status, data } = await apiRequest('/categories');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data).toHaveProperty('categories');
			expect(Array.isArray(data.data.categories)).toBe(true);
		});

		it('GET /api/categories/tree should return category tree', async () => {
			const parent = await createTestCategory({ name: 'Technology' });
			await createTestCategory({ name: 'AI', parentId: parent.id });
			await createTestCategory({ name: 'Web', parentId: parent.id });

			const { status, data } = await apiRequest('/categories/tree');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('GET /api/categories/lookup should search categories', async () => {
			await createTestCategory({ name: 'Climate Change' });
			await createTestCategory({ name: 'Economics' });

			const { status, data } = await apiRequest('/categories/lookup?name=Climate%20Change');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe('Facts API', () => {
		it('GET /api/facts should return facts list', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, title: 'Test Fact 1' });
			await createTestFact({ userId: user.id, title: 'Test Fact 2' });

			const { status, data } = await apiRequest('/facts');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data).toHaveProperty('facts');
			expect(Array.isArray(data.data.facts)).toBe(true);
		});

		it('GET /api/facts should support search', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, title: 'Climate Change Impact' });
			await createTestFact({ userId: user.id, title: 'Economic Policy' });

			const { status, data } = await apiRequest('/facts?search=climate');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('GET /api/facts should support status filter', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id, status: 'PROVEN' });
			await createTestFact({ userId: user.id, status: 'SUBMITTED' });

			const { status, data } = await apiRequest('/facts?status=PROVEN');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('GET /api/facts/:id should return single fact', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id, title: 'Specific Fact' });

			const { status, data } = await apiRequest(`/facts/${fact.id}`);

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.title).toBe('Specific Fact');
		});

		it('GET /api/facts/:id should 404 for non-existent fact', async () => {
			const { status } = await apiRequest('/facts/nonexistent-id');

			expect(status).toBe(404);
		});
	});

	describe('Debates API', () => {
		it('GET /api/debates with status=PUBLISHED should return published debates', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const fact = await createTestFact({ userId: user1.id });

			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id,
					status: 'PUBLISHED',
					title: 'Public Debate',
					publishedAt: new Date()
				}
			});

			const { status, data } = await apiRequest('/debates?status=PUBLISHED');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.debates).toBeDefined();
		});

		it('GET /api/debates without auth should require authentication for non-published', async () => {
			const { status } = await apiRequest('/debates');

			expect(status).toBe(401);
		});
	});

	describe('Statistics API', () => {
		it('GET /api/stats should return statistics', async () => {
			const user = await createTestUser();
			await createTestFact({ userId: user.id });
			await createTestFact({ userId: user.id });

			const { status, data } = await apiRequest('/stats');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data).toHaveProperty('totalFacts');
			expect(data.data).toHaveProperty('totalUsers');
		});
	});

	describe('Auth API', () => {
		it('POST /api/auth/register should validate email format', async () => {
			const { status, data } = await apiRequest('/auth/register', {
				method: 'POST',
				body: JSON.stringify({
					email: 'invalid-email',
					password: 'password123',
					firstName: 'Test',
					lastName: 'User'
				})
			});

			expect(status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('POST /api/auth/register should validate password length', async () => {
			const { status, data } = await apiRequest('/auth/register', {
				method: 'POST',
				body: JSON.stringify({
					email: 'test@example.com',
					password: 'short',
					firstName: 'Test',
					lastName: 'User'
				})
			});

			expect(status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('POST /api/auth/login should reject invalid credentials', async () => {
			const { status, data } = await apiRequest('/auth/login', {
				method: 'POST',
				body: JSON.stringify({
					email: 'nonexistent@example.com',
					password: 'wrongpassword'
				})
			});

			expect(status).toBe(401);
			expect(data.success).toBe(false);
		});
	});

	describe('Anonymous Voting API', () => {
		it('POST /api/votes/anonymous should create anonymous vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const { status, data } = await apiRequest('/votes/anonymous', {
				method: 'POST',
				body: JSON.stringify({
					contentType: 'fact',
					contentId: fact.id,
					value: 1
				}),
				headers: {
					'X-Forwarded-For': '192.168.1.100'
				}
			});

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('POST /api/votes/anonymous should handle duplicate votes', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			// First vote
			await apiRequest('/votes/anonymous', {
				method: 'POST',
				body: JSON.stringify({
					contentType: 'fact',
					contentId: fact.id,
					value: 1
				}),
				headers: {
					'X-Forwarded-For': '192.168.1.101'
				}
			});

			// Second vote from same IP
			const { status, data } = await apiRequest('/votes/anonymous', {
				method: 'POST',
				body: JSON.stringify({
					contentType: 'fact',
					contentId: fact.id,
					value: -1
				}),
				headers: {
					'X-Forwarded-For': '192.168.1.101'
				}
			});

			// Should either update the vote, reject duplicate, or rate limit
			expect([200, 400, 409, 429]).toContain(status);
		});
	});

	describe('Notifications API', () => {
		it('GET /api/notifications without auth should return 401', async () => {
			const { status } = await apiRequest('/notifications');

			expect(status).toBe(401);
		});

		it('GET /api/notifications/preferences without auth should return 401', async () => {
			const { status } = await apiRequest('/notifications/preferences');

			expect(status).toBe(401);
		});
	});

	describe('User API', () => {
		it('GET /api/user/profile without auth should return 401', async () => {
			const { status } = await apiRequest('/user/profile');

			expect(status).toBe(401);
		});
	});

	describe('Moderation API', () => {
		it('GET /api/moderation/queue without auth should return 401', async () => {
			const { status } = await apiRequest('/moderation/queue');

			expect(status).toBe(401);
		});
	});

	describe('Public Profiles API', () => {
		it('GET /api/profiles/:id should return public user profile', async () => {
			const user = await createTestUser({
				email: 'public@test.com',
				firstName: 'Public',
				lastName: 'User'
			});

			const { status, data } = await apiRequest(`/profiles/${user.id}`);

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data.firstName).toBe('Public');
			// Email should NOT be in public profile
			expect(data.data.email).toBeUndefined();
		});

		it('GET /api/profiles/:id should 404 for non-existent user', async () => {
			const { status } = await apiRequest('/profiles/nonexistent-id');

			expect(status).toBe(404);
		});
	});

	describe('Sources API', () => {
		it('GET /api/sources should return sources', async () => {
			const { status, data } = await apiRequest('/sources');

			expect(status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe('Error Handling', () => {
		it('should return 404 for non-existent endpoint', async () => {
			const { status } = await apiRequest('/nonexistent/endpoint');

			expect(status).toBe(404);
		});

		it('should handle malformed JSON gracefully', async () => {
			const response = await fetch(`${API_BASE}/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json'
			});

			expect([400, 500]).toContain(response.status);
		});
	});
});
