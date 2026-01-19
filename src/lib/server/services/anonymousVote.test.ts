import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../db', () => ({
	db: {
		anonymousVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		},
		ipRateLimit: {
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			deleteMany: vi.fn()
		}
	}
}));

vi.mock('$lib/utils/crypto', () => ({
	sha256: vi.fn((input: string) => `hashed_${input}`)
}));

describe('R10: Anonymous Voting Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset environment
		process.env.FEATURE_ANONYMOUS_VOTING = 'true';
		process.env.RATE_LIMIT_ANONYMOUS_VOTES_PER_DAY = '1';
	});

	describe('submitAnonymousVote', () => {
		it('should successfully submit a vote', async () => {
			const { db } = await import('../db');
			const { submitAnonymousVote } = await import('./anonymousVote');

			// Mock no existing vote
			vi.mocked(db.anonymousVote.findUnique).mockResolvedValue(null);

			// Mock rate limit check - no existing limit
			vi.mocked(db.ipRateLimit.findUnique).mockResolvedValue(null);
			vi.mocked(db.ipRateLimit.create).mockResolvedValue({
				id: 'rate-1',
				ipHash: 'hashed_192.168.1.1:purfacted-ip-salt',
				voteCount: 0,
				resetAt: new Date(Date.now() + 86400000),
				createdAt: new Date(),
				updatedAt: new Date()
			});

			// Mock vote creation
			vi.mocked(db.anonymousVote.create).mockResolvedValue({
				id: 'vote-123',
				ipHash: 'hashed_192.168.1.1:purfacted-ip-salt',
				contentType: 'fact',
				contentId: 'fact-1',
				value: 1,
				weight: 0.1,
				captchaToken: null,
				createdAt: new Date()
			});

			// Mock rate limit update
			vi.mocked(db.ipRateLimit.update).mockResolvedValue({} as any);

			const result = await submitAnonymousVote({
				ip: '192.168.1.1',
				contentType: 'fact',
				contentId: 'fact-1',
				value: 1,
				captchaToken: 'test-captcha'
			});

			expect(result.success).toBe(true);
			expect(result.voteId).toBe('vote-123');
			expect(result.weight).toBe(0.1);
		});

		it('should reject already voted content', async () => {
			const { db } = await import('../db');
			const { submitAnonymousVote } = await import('./anonymousVote');

			// Mock existing vote
			vi.mocked(db.anonymousVote.findUnique).mockResolvedValue({
				id: 'existing-vote',
				ipHash: 'hashed_ip',
				contentType: 'fact',
				contentId: 'fact-1',
				value: 1,
				weight: 0.1,
				captchaToken: null,
				createdAt: new Date()
			});

			// Mock rate limit - allow votes
			vi.mocked(db.ipRateLimit.findUnique).mockResolvedValue({
				id: 'rate-1',
				ipHash: 'hashed_ip',
				voteCount: 0,
				resetAt: new Date(Date.now() + 86400000),
				createdAt: new Date(),
				updatedAt: new Date()
			});

			await expect(
				submitAnonymousVote({
					ip: '192.168.1.1',
					contentType: 'fact',
					contentId: 'fact-1',
					value: 1
				})
			).rejects.toMatchObject({
				code: 'ALREADY_VOTED'
			});
		});

		it('should reject when rate limit exceeded', async () => {
			const { db } = await import('../db');
			const { submitAnonymousVote } = await import('./anonymousVote');

			// Mock no existing vote
			vi.mocked(db.anonymousVote.findUnique).mockResolvedValue(null);

			// Mock rate limit exceeded
			vi.mocked(db.ipRateLimit.findUnique).mockResolvedValue({
				id: 'rate-1',
				ipHash: 'hashed_ip',
				voteCount: 5, // Exceeded
				resetAt: new Date(Date.now() + 86400000),
				createdAt: new Date(),
				updatedAt: new Date()
			});

			await expect(
				submitAnonymousVote({
					ip: '192.168.1.1',
					contentType: 'fact',
					contentId: 'fact-1',
					value: 1
				})
			).rejects.toMatchObject({
				code: 'RATE_LIMITED'
			});
		});

		it('should reject invalid vote values', async () => {
			const { submitAnonymousVote } = await import('./anonymousVote');

			await expect(
				submitAnonymousVote({
					ip: '192.168.1.1',
					contentType: 'fact',
					contentId: 'fact-1',
					value: 2 as any // Invalid
				})
			).rejects.toMatchObject({
				code: 'INVALID_VOTE'
			});
		});

		it('should reject when feature is disabled', async () => {
			process.env.FEATURE_ANONYMOUS_VOTING = 'false';

			// Need to re-import to pick up new env
			vi.resetModules();
			const { submitAnonymousVote } = await import('./anonymousVote');

			await expect(
				submitAnonymousVote({
					ip: '192.168.1.1',
					contentType: 'fact',
					contentId: 'fact-1',
					value: 1
				})
			).rejects.toMatchObject({
				code: 'FEATURE_DISABLED'
			});
		});
	});

	describe('getAnonymousVoteStatus', () => {
		it('should return vote status for IP', async () => {
			const { db } = await import('../db');
			const { getAnonymousVoteStatus } = await import('./anonymousVote');

			// Mock existing vote
			vi.mocked(db.anonymousVote.findUnique).mockResolvedValue({
				id: 'vote-1',
				ipHash: 'hashed_ip',
				contentType: 'fact',
				contentId: 'fact-1',
				value: 1,
				weight: 0.1,
				captchaToken: null,
				createdAt: new Date()
			});

			// Mock rate limit
			vi.mocked(db.ipRateLimit.findUnique).mockResolvedValue({
				id: 'rate-1',
				ipHash: 'hashed_ip',
				voteCount: 1,
				resetAt: new Date(Date.now() + 86400000),
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const status = await getAnonymousVoteStatus('192.168.1.1', 'fact', 'fact-1');

			expect(status.hasVoted).toBe(true);
			expect(status.vote).toBe(1);
		});

		it('should return no vote when not voted', async () => {
			const { db } = await import('../db');
			const { getAnonymousVoteStatus } = await import('./anonymousVote');

			vi.mocked(db.anonymousVote.findUnique).mockResolvedValue(null);
			vi.mocked(db.ipRateLimit.findUnique).mockResolvedValue(null);
			vi.mocked(db.ipRateLimit.create).mockResolvedValue({
				id: 'rate-1',
				ipHash: 'hashed_ip',
				voteCount: 0,
				resetAt: new Date(Date.now() + 86400000),
				createdAt: new Date(),
				updatedAt: new Date()
			});

			const status = await getAnonymousVoteStatus('192.168.1.1', 'fact', 'fact-1');

			expect(status.hasVoted).toBe(false);
			expect(status.vote).toBeNull();
		});
	});

	describe('getAnonymousVotesForContent', () => {
		it('should aggregate votes for content', async () => {
			const { db } = await import('../db');
			const { getAnonymousVotesForContent } = await import('./anonymousVote');

			vi.mocked(db.anonymousVote.findMany).mockResolvedValue([
				{ id: '1', value: 1, weight: 0.1 } as any,
				{ id: '2', value: 1, weight: 0.1 } as any,
				{ id: '3', value: -1, weight: 0.1 } as any
			]);

			const result = await getAnonymousVotesForContent('fact', 'fact-1');

			expect(result.upvotes).toBe(2);
			expect(result.downvotes).toBe(1);
			expect(result.weightedScore).toBeCloseTo(0.1); // (2 * 0.1) + (-1 * 0.1) = 0.1
		});
	});
});
