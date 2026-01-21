import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkLoginRateLimit, resetLoginRateLimit, checkRateLimit } from './rateLimit';

// Mock the redis module
vi.mock('./redis', () => {
	const store = new Map<string, number>();

	return {
		incr: vi.fn(async (key: string) => {
			const current = store.get(key) || 0;
			const newValue = current + 1;
			store.set(key, newValue);
			return newValue;
		}),
		expire: vi.fn(async () => {}),
		ttl: vi.fn(async () => 900), // 15 minutes in seconds
		del: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		// Helper to reset store between tests
		__reset: () => store.clear()
	};
});

describe('R4: Rate Limiting', () => {
	beforeEach(async () => {
		// Reset the mock store
		const redis = await import('./redis');
		(redis as any).__reset?.();
		vi.clearAllMocks();
	});

	describe('checkLoginRateLimit', () => {
		// Note: LOGIN_MAX_ATTEMPTS is 10 in test environment (.env.test)
		const MAX_ATTEMPTS = 10;

		it('should allow first login attempt', async () => {
			const result = await checkLoginRateLimit('test@example.com');

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(MAX_ATTEMPTS - 1); // max - 1 attempt
		});

		it('should track multiple attempts', async () => {
			await checkLoginRateLimit('test@example.com');
			await checkLoginRateLimit('test@example.com');
			const result = await checkLoginRateLimit('test@example.com');

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(MAX_ATTEMPTS - 3); // max - 3 attempts
		});

		it('should block after max attempts exceeded', async () => {
			// Make max + 1 attempts
			for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
				await checkLoginRateLimit('test@example.com');
			}

			const result = await checkLoginRateLimit('test@example.com');

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it('should use different counters for different identifiers', async () => {
			await checkLoginRateLimit('user1@example.com');
			await checkLoginRateLimit('user1@example.com');

			const result1 = await checkLoginRateLimit('user1@example.com');
			const result2 = await checkLoginRateLimit('user2@example.com');

			expect(result1.remaining).toBe(MAX_ATTEMPTS - 3); // 3 attempts
			expect(result2.remaining).toBe(MAX_ATTEMPTS - 1); // 1 attempt
		});
	});

	describe('resetLoginRateLimit', () => {
		const MAX_ATTEMPTS = 10;

		it('should reset the rate limit counter', async () => {
			// Make some attempts
			await checkLoginRateLimit('test@example.com');
			await checkLoginRateLimit('test@example.com');

			// Reset
			await resetLoginRateLimit('test@example.com');

			// Next check should show full remaining
			const result = await checkLoginRateLimit('test@example.com');
			expect(result.remaining).toBe(MAX_ATTEMPTS - 1); // Fresh start, 1 attempt made
		});
	});

	describe('checkRateLimit (general)', () => {
		it('should allow requests within limit', async () => {
			const result = await checkRateLimit('user123', 'api', 100, 60);

			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(99);
		});

		it('should block after exceeding limit', async () => {
			// Make 101 requests (max is 100)
			for (let i = 0; i < 101; i++) {
				await checkRateLimit('user123', 'api', 100, 60);
			}

			const result = await checkRateLimit('user123', 'api', 100, 60);

			expect(result.allowed).toBe(false);
			expect(result.remaining).toBe(0);
		});

		it('should use separate counters for different namespaces', async () => {
			await checkRateLimit('user123', 'api', 10, 60);
			const apiResult = await checkRateLimit('user123', 'api', 10, 60);

			const voteResult = await checkRateLimit('user123', 'vote', 10, 60);

			expect(apiResult.remaining).toBe(8); // 2 api requests
			expect(voteResult.remaining).toBe(9); // 1 vote request
		});
	});
});
