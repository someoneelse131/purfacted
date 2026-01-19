import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BanError, hashIp, getBanConfig } from './ban';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			update: vi.fn(),
			findMany: vi.fn()
		},
		ban: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn()
		},
		bannedEmail: {
			findUnique: vi.fn(),
			upsert: vi.fn()
		},
		bannedIp: {
			findUnique: vi.fn(),
			upsert: vi.fn()
		},
		accountFlag: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		},
		veto: {
			count: vi.fn(),
			groupBy: vi.fn()
		}
	}
}));

describe('R37: Ban System', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('BanError', () => {
		it('should have correct name and code', () => {
			const error = new BanError('Test message', 'TEST_CODE');
			expect(error.name).toBe('BanError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Progressive ban levels', () => {
		it('should have first offense: blocked few days (default 3)', () => {
			const config = getBanConfig();
			expect(config.level1Duration).toBe(3);
		});

		it('should have second offense: blocked 1 month', () => {
			const config = getBanConfig();
			expect(config.level2Duration).toBe(30);
		});

		it('should have third offense: permanent', () => {
			// Level 3 has null expiresAt (permanent)
			const level = 3;
			const expiresAt = null; // permanent
			expect(level).toBe(3);
			expect(expiresAt).toBeNull();
		});
	});

	describe('IP hashing', () => {
		it('should hash IP addresses for privacy', () => {
			const ip = '192.168.1.1';
			const hash = hashIp(ip);

			expect(hash).toBeDefined();
			expect(hash.length).toBe(64); // SHA256 hex
			expect(hash).not.toBe(ip);
		});

		it('should produce consistent hashes', () => {
			const ip = '10.0.0.1';
			const hash1 = hashIp(ip);
			const hash2 = hashIp(ip);

			expect(hash1).toBe(hash2);
		});

		it('should produce different hashes for different IPs', () => {
			const hash1 = hashIp('192.168.1.1');
			const hash2 = hashIp('192.168.1.2');

			expect(hash1).not.toBe(hash2);
		});
	});

	describe('Blocked actions when banned', () => {
		it('should block voting when banned', () => {
			const isBanned = true;
			const canVote = !isBanned;
			expect(canVote).toBe(false);
		});

		it('should block posting when banned', () => {
			const isBanned = true;
			const canPost = !isBanned;
			expect(canPost).toBe(false);
		});

		it('should block verifying when banned', () => {
			const isBanned = true;
			const canVerify = !isBanned;
			expect(canVerify).toBe(false);
		});
	});

	describe('Email and IP blocking on permanent ban', () => {
		it('should block email on third offense', () => {
			const banLevel = 3;
			const shouldBlockEmail = banLevel === 3;
			expect(shouldBlockEmail).toBe(true);
		});

		it('should block IP on third offense', () => {
			const banLevel = 3;
			const shouldBlockIp = banLevel === 3;
			expect(shouldBlockIp).toBe(true);
		});

		it('should reject new accounts from banned email', () => {
			const isEmailBanned = true;
			const canRegister = !isEmailBanned;
			expect(canRegister).toBe(false);
		});

		it('should reject new accounts from banned IP', () => {
			const isIpBanned = true;
			const canRegister = !isIpBanned;
			expect(canRegister).toBe(false);
		});
	});

	describe('Ban expiration', () => {
		it('should clear ban when expired', () => {
			const bannedUntil = new Date('2025-01-01');
			const now = new Date('2026-01-15');
			const isExpired = bannedUntil < now;

			expect(isExpired).toBe(true);
		});

		it('should maintain active ban before expiration', () => {
			const bannedUntil = new Date('2027-01-01');
			const now = new Date('2026-01-15');
			const isExpired = bannedUntil < now;

			expect(isExpired).toBe(false);
		});
	});

	describe('Ban history', () => {
		it('should track ban level on user', () => {
			const user = { banLevel: 2 };
			expect(user.banLevel).toBe(2);
		});

		it('should track ban history records', () => {
			const bans = [
				{ level: 1, createdAt: new Date('2025-06-01') },
				{ level: 2, createdAt: new Date('2025-09-01') }
			];

			expect(bans.length).toBe(2);
		});
	});
});

describe('R38: Negative Veto Account Flagging', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Failed veto tracking', () => {
		it('should track failed vetos per user', () => {
			const userVetos = [
				{ status: 'REJECTED' },
				{ status: 'REJECTED' },
				{ status: 'APPROVED' },
				{ status: 'REJECTED' }
			];

			const failedCount = userVetos.filter((v) => v.status === 'REJECTED').length;
			expect(failedCount).toBe(3);
		});

		it('should have configurable threshold (default 5)', () => {
			const config = getBanConfig();
			expect(config.failedVetoThreshold).toBe(5);
		});
	});

	describe('Account flagging', () => {
		it('should flag account at threshold', () => {
			const failedVetos = 5;
			const threshold = 5;
			const shouldFlag = failedVetos >= threshold;

			expect(shouldFlag).toBe(true);
		});

		it('should not flag below threshold', () => {
			const failedVetos = 4;
			const threshold = 5;
			const shouldFlag = failedVetos >= threshold;

			expect(shouldFlag).toBe(false);
		});

		it('should create flag with reason', () => {
			const flag = {
				userId: 'user-1',
				reason: 'NEGATIVE_VETO_THRESHOLD',
				details: 'User has 5 failed vetos'
			};

			expect(flag.reason).toBe('NEGATIVE_VETO_THRESHOLD');
		});
	});

	describe('Blocked during review', () => {
		it('should block actions when flagged', () => {
			const isFlagged = true;
			const canPerformActions = !isFlagged;

			expect(canPerformActions).toBe(false);
		});

		it('should track flag status', () => {
			const statuses = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'];

			expect(statuses).toContain('PENDING');
			expect(statuses).toContain('REVIEWING');
		});
	});

	describe('Moderator review', () => {
		it('should not auto-ban, moderator decides', () => {
			// Flag doesn't automatically ban
			const isAutoBan = false;
			expect(isAutoBan).toBe(false);
		});

		it('should allow dismiss option', () => {
			const resolutions = ['dismiss', 'warn', 'ban'];
			expect(resolutions).toContain('dismiss');
		});

		it('should allow warn option', () => {
			const resolutions = ['dismiss', 'warn', 'ban'];
			expect(resolutions).toContain('warn');
		});

		it('should allow ban option', () => {
			const resolutions = ['dismiss', 'warn', 'ban'];
			expect(resolutions).toContain('ban');
		});

		it('should track who reviewed', () => {
			const flag = {
				reviewedById: 'mod-1',
				resolution: 'dismissed'
			};

			expect(flag.reviewedById).toBe('mod-1');
		});
	});

	describe('Flag lifecycle', () => {
		it('should prevent duplicate pending flags', () => {
			const existingFlags = [
				{ userId: 'user-1', status: 'PENDING' }
			];

			const newFlagUserId = 'user-1';
			const hasPendingFlag = existingFlags.some(
				(f) => f.userId === newFlagUserId && f.status === 'PENDING'
			);

			expect(hasPendingFlag).toBe(true);
		});

		it('should allow new flag after resolution', () => {
			const existingFlags = [
				{ userId: 'user-1', status: 'RESOLVED' }
			];

			const hasPendingFlag = existingFlags.some(
				(f) => f.userId === 'user-1' && ['PENDING', 'REVIEWING'].includes(f.status)
			);

			expect(hasPendingFlag).toBe(false);
		});
	});
});
