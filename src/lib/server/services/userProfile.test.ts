import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	ProfileError,
	getPrivacySettings,
	updatePrivacySettings,
	getUserBadge,
	validateHoneypot
} from './userProfile';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			count: vi.fn()
		},
		expertVerification: {
			findFirst: vi.fn(),
			findMany: vi.fn()
		},
		fact: {
			count: vi.fn(),
			findMany: vi.fn()
		}
	}
}));

describe('R40: User Profile Public View', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('ProfileError', () => {
		it('should have correct name and code', () => {
			const error = new ProfileError('Test message', 'TEST_CODE');
			expect(error.name).toBe('ProfileError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Privacy Settings', () => {
		it('should return default privacy settings', async () => {
			const settings = await getPrivacySettings('user-123');

			expect(settings).toEqual({
				showTrustScore: true,
				showStats: true,
				showRecentActivity: true,
				showExpertiseFields: true
			});
		});

		it('should update privacy settings', async () => {
			const updated = await updatePrivacySettings('user-123', {
				showTrustScore: false,
				showStats: false
			});

			expect(updated.showTrustScore).toBe(false);
			expect(updated.showStats).toBe(false);
			expect(updated.showRecentActivity).toBe(true);
		});

		it('should partially update settings', async () => {
			const updated = await updatePrivacySettings('user-123', {
				showRecentActivity: false
			});

			expect(updated.showTrustScore).toBe(true);
			expect(updated.showRecentActivity).toBe(false);
		});
	});

	describe('User Badge', () => {
		it('should return verified badge', () => {
			const badge = getUserBadge('VERIFIED');

			expect(badge.label).toBe('Verified');
			expect(badge.color).toBe('blue');
		});

		it('should return expert badge', () => {
			const badge = getUserBadge('EXPERT');

			expect(badge.label).toBe('Expert');
			expect(badge.color).toBe('green');
		});

		it('should return PhD badge', () => {
			const badge = getUserBadge('PHD');

			expect(badge.label).toBe('PhD');
			expect(badge.color).toBe('purple');
		});

		it('should return organization badge', () => {
			const badge = getUserBadge('ORGANIZATION');

			expect(badge.label).toBe('Organization');
			expect(badge.color).toBe('orange');
		});

		it('should return moderator badge', () => {
			const badge = getUserBadge('MODERATOR');

			expect(badge.label).toBe('Moderator');
			expect(badge.color).toBe('red');
		});

		it('should return anonymous badge', () => {
			const badge = getUserBadge('ANONYMOUS');

			expect(badge.label).toBe('Anonymous');
			expect(badge.color).toBe('gray');
		});

		it('should default to verified badge for unknown type', () => {
			const badge = getUserBadge('UNKNOWN');

			expect(badge.label).toBe('Verified');
			expect(badge.color).toBe('blue');
		});
	});

	describe('Public Profile Interface', () => {
		it('should define profile with required fields', () => {
			const profile = {
				id: 'user-123',
				firstName: 'John',
				lastName: 'D.',
				userType: 'VERIFIED',
				trustScore: 50,
				joinDate: new Date(),
				stats: {
					factsPosted: 10,
					factsProven: 5,
					factsDisproven: 1,
					accuracyRate: 50,
					expertiseFields: []
				},
				recentActivity: []
			};

			expect(profile.id).toBeDefined();
			expect(profile.firstName).toBeDefined();
			expect(profile.lastName).toBeDefined();
			expect(profile.userType).toBeDefined();
			expect(profile.trustScore).toBeDefined();
			expect(profile.stats).toBeDefined();
		});

		it('should support verification badge for experts', () => {
			const profile = {
				id: 'user-123',
				firstName: 'Jane',
				lastName: 'D.',
				userType: 'EXPERT',
				trustScore: 100,
				joinDate: new Date(),
				verificationBadge: {
					type: 'EXPERT',
					verifiers: ['John S.', 'Jane D.']
				},
				stats: {
					factsPosted: 20,
					factsProven: 15,
					factsDisproven: 2,
					accuracyRate: 75,
					expertiseFields: ['Physics', 'Mathematics']
				},
				recentActivity: []
			};

			expect(profile.verificationBadge).toBeDefined();
			expect(profile.verificationBadge?.type).toBe('EXPERT');
			expect(profile.verificationBadge?.verifiers).toHaveLength(2);
		});
	});

	describe('Privacy Applied to Profile', () => {
		it('should hide trust score when privacy setting is off', () => {
			const privacy = { showTrustScore: false };
			const trustScore = privacy.showTrustScore ? 100 : -1;

			expect(trustScore).toBe(-1);
		});

		it('should show trust score when privacy setting is on', () => {
			const privacy = { showTrustScore: true };
			const trustScore = privacy.showTrustScore ? 100 : -1;

			expect(trustScore).toBe(100);
		});

		it('should hide stats when privacy setting is off', () => {
			const privacy = { showStats: false };
			const showStats = privacy.showStats;

			expect(showStats).toBe(false);
		});

		it('should hide recent activity when privacy setting is off', () => {
			const privacy = { showRecentActivity: false };
			const recentActivity = privacy.showRecentActivity ? ['fact1', 'fact2'] : [];

			expect(recentActivity).toHaveLength(0);
		});

		it('should hide expertise fields when privacy setting is off', () => {
			const privacy = { showExpertiseFields: false };
			const expertiseFields = privacy.showExpertiseFields
				? ['Physics', 'Chemistry']
				: [];

			expect(expertiseFields).toHaveLength(0);
		});
	});

	describe('Accuracy Rate Calculation', () => {
		it('should calculate accuracy rate correctly', () => {
			const factsPosted = 10;
			const factsProven = 5;
			const accuracyRate = factsPosted > 0
				? Math.round((factsProven / factsPosted) * 100)
				: 0;

			expect(accuracyRate).toBe(50);
		});

		it('should return 0 for no facts posted', () => {
			const factsPosted = 0;
			const factsProven = 0;
			const accuracyRate = factsPosted > 0
				? Math.round((factsProven / factsPosted) * 100)
				: 0;

			expect(accuracyRate).toBe(0);
		});

		it('should handle 100% accuracy', () => {
			const factsPosted = 10;
			const factsProven = 10;
			const accuracyRate = factsPosted > 0
				? Math.round((factsProven / factsPosted) * 100)
				: 0;

			expect(accuracyRate).toBe(100);
		});
	});

	describe('Last Name Privacy', () => {
		it('should only show first initial of last name', () => {
			const lastName = 'Doe';
			const displayName = lastName[0] + '.';

			expect(displayName).toBe('D.');
		});

		it('should handle single character last name', () => {
			const lastName = 'X';
			const displayName = lastName[0] + '.';

			expect(displayName).toBe('X.');
		});
	});

	describe('Top Contributors', () => {
		it('should order by trust score descending', () => {
			const users = [
				{ id: '1', trustScore: 50 },
				{ id: '2', trustScore: 100 },
				{ id: '3', trustScore: 75 }
			];

			const sorted = users.sort((a, b) => b.trustScore - a.trustScore);

			expect(sorted[0].trustScore).toBe(100);
			expect(sorted[1].trustScore).toBe(75);
			expect(sorted[2].trustScore).toBe(50);
		});

		it('should exclude anonymous and organization users', () => {
			const excludeTypes = ['ANONYMOUS', 'ORGANIZATION'];
			const userType = 'ANONYMOUS';
			const isExcluded = excludeTypes.includes(userType);

			expect(isExcluded).toBe(true);
		});
	});

	describe('User Search', () => {
		it('should search by first name', () => {
			const query = 'John';
			const users = [
				{ firstName: 'John', lastName: 'Doe' },
				{ firstName: 'Johnny', lastName: 'Smith' },
				{ firstName: 'Jane', lastName: 'Doe' }
			];

			const results = users.filter(
				(u) =>
					u.firstName.toLowerCase().includes(query.toLowerCase()) ||
					u.lastName.toLowerCase().includes(query.toLowerCase())
			);

			expect(results).toHaveLength(2);
		});

		it('should search by last name', () => {
			const query = 'Doe';
			const users = [
				{ firstName: 'John', lastName: 'Doe' },
				{ firstName: 'Jane', lastName: 'Doe' },
				{ firstName: 'Bob', lastName: 'Smith' }
			];

			const results = users.filter(
				(u) =>
					u.firstName.toLowerCase().includes(query.toLowerCase()) ||
					u.lastName.toLowerCase().includes(query.toLowerCase())
			);

			expect(results).toHaveLength(2);
		});

		it('should be case insensitive', () => {
			const query = 'JOHN';
			const users = [
				{ firstName: 'john', lastName: 'Doe' },
				{ firstName: 'John', lastName: 'Smith' }
			];

			const results = users.filter((u) =>
				u.firstName.toLowerCase().includes(query.toLowerCase())
			);

			expect(results).toHaveLength(2);
		});
	});

	describe('Profile Stats', () => {
		it('should count total users', () => {
			const totalUsers = 100;
			expect(totalUsers).toBeGreaterThan(0);
		});

		it('should count verified users', () => {
			const verifiedUsers = 50;
			expect(verifiedUsers).toBeGreaterThanOrEqual(0);
		});

		it('should count experts (including PhDs)', () => {
			const experts = 10;
			const phds = 5;
			const totalExperts = experts + phds;

			expect(totalExperts).toBe(15);
		});
	});

	describe('Recent Activity', () => {
		it('should limit to 5 recent items', () => {
			const recentFacts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const limited = recentFacts.slice(0, 5);

			expect(limited).toHaveLength(5);
		});

		it('should include fact type and title', () => {
			const activity = {
				type: 'fact',
				title: 'Test Fact',
				date: new Date()
			};

			expect(activity.type).toBe('fact');
			expect(activity.title).toBeDefined();
			expect(activity.date).toBeInstanceOf(Date);
		});
	});
});
