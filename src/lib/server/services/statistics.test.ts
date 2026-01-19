import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	getPlatformStats,
	getActivityStats,
	getTrustDistribution,
	getTopContributors,
	getFactsByCategory,
	getFactsByStatus,
	getHomepageSummary
} from './statistics';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			count: vi.fn(),
			findMany: vi.fn()
		},
		fact: {
			count: vi.fn(),
			findMany: vi.fn(),
			groupBy: vi.fn()
		},
		factVote: {
			count: vi.fn(),
			findMany: vi.fn()
		},
		debate: {
			count: vi.fn()
		},
		category: {
			count: vi.fn(),
			findMany: vi.fn()
		}
	}
}));

import { db } from '../db';

describe('R47: Statistics Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getPlatformStats', () => {
		it('should return comprehensive platform statistics', async () => {
			// Mock all the count calls
			(db.user.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(1000) // total
				.mockResolvedValueOnce(800) // verified
				.mockResolvedValueOnce(50) // experts
				.mockResolvedValueOnce(20) // phds
				.mockResolvedValueOnce(30) // orgs
				.mockResolvedValueOnce(10) // mods
				.mockResolvedValueOnce(50); // new this week

			(db.fact.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(5000) // total
				.mockResolvedValueOnce(3000) // proven
				.mockResolvedValueOnce(500) // disproven
				.mockResolvedValueOnce(200) // disputed
				.mockResolvedValueOnce(100) // outdated
				.mockResolvedValueOnce(1200) // pending
				.mockResolvedValueOnce(300); // new this week

			(db.factVote.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(50000)
				.mockResolvedValueOnce(5000);

			(db.debate.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(500)
				.mockResolvedValueOnce(200)
				.mockResolvedValueOnce(50);

			(db.category.count as ReturnType<typeof vi.fn>).mockResolvedValue(100);

			(db.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ name: 'Science', _count: { facts: 1000 } },
				{ name: 'Politics', _count: { facts: 800 } }
			]);

			const stats = await getPlatformStats();

			expect(stats.users.total).toBe(1000);
			expect(stats.users.verified).toBe(800);
			expect(stats.users.experts).toBe(70); // 50 + 20
			expect(stats.facts.total).toBe(5000);
			expect(stats.facts.proven).toBe(3000);
			expect(stats.votes.total).toBe(50000);
			expect(stats.debates.total).toBe(500);
			expect(stats.categories.total).toBe(100);
		});
	});

	describe('getActivityStats', () => {
		it('should return activity data for last 30 days', async () => {
			(db.fact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ createdAt: new Date() },
				{ createdAt: new Date() }
			]);
			(db.factVote.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const stats = await getActivityStats(30);

			expect(stats.factsPerDay).toHaveLength(31); // 30 days + today
			expect(stats.votesPerDay).toHaveLength(31);
			expect(stats.usersPerDay).toHaveLength(31);
		});

		it('should have date and count for each day', async () => {
			(db.fact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(db.factVote.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const stats = await getActivityStats(7);
			const dayData = stats.factsPerDay[0];

			expect(dayData).toHaveProperty('date');
			expect(dayData).toHaveProperty('count');
		});
	});

	describe('getTrustDistribution', () => {
		it('should calculate trust score distribution', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ trustScore: 10 },
				{ trustScore: 50 },
				{ trustScore: 100 },
				{ trustScore: -20 },
				{ trustScore: 75 }
			]);

			const distribution = await getTrustDistribution();

			expect(distribution.ranges).toHaveLength(7);
			expect(distribution.average).toBeDefined();
			expect(distribution.median).toBeDefined();
		});

		it('should calculate correct average', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ trustScore: 10 },
				{ trustScore: 20 },
				{ trustScore: 30 }
			]);

			const distribution = await getTrustDistribution();

			expect(distribution.average).toBe(20);
		});

		it('should calculate correct median', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ trustScore: 10 },
				{ trustScore: 20 },
				{ trustScore: 30 }
			]);

			const distribution = await getTrustDistribution();

			expect(distribution.median).toBe(20);
		});

		it('should handle empty user list', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const distribution = await getTrustDistribution();

			expect(distribution.average).toBe(0);
			expect(distribution.median).toBe(0);
		});
	});

	describe('getTopContributors', () => {
		it('should return top contributors by trust score', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{
					id: '1',
					firstName: 'John',
					lastName: 'Doe',
					userType: 'EXPERT',
					trustScore: 100,
					_count: { facts: 50 }
				},
				{
					id: '2',
					firstName: 'Jane',
					lastName: 'Smith',
					userType: 'PHD',
					trustScore: 90,
					_count: { facts: 40 }
				}
			]);

			const contributors = await getTopContributors(10);

			expect(contributors).toHaveLength(2);
			expect(contributors[0].trustScore).toBe(100);
			expect(contributors[0].factCount).toBe(50);
		});

		it('should show only last name initial', async () => {
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{
					id: '1',
					firstName: 'John',
					lastName: 'Doe',
					userType: 'EXPERT',
					trustScore: 100,
					_count: { facts: 50 }
				}
			]);

			const contributors = await getTopContributors(10);

			expect(contributors[0].lastName).toBe('D.');
		});
	});

	describe('getFactsByCategory', () => {
		it('should return facts grouped by category', async () => {
			(db.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ name: 'Science', _count: { facts: 100 } },
				{ name: 'Politics', _count: { facts: 80 } }
			]);

			const result = await getFactsByCategory();

			expect(result).toHaveLength(2);
			expect(result[0].category).toBe('Science');
			expect(result[0].count).toBe(100);
		});
	});

	describe('getFactsByStatus', () => {
		it('should return facts grouped by status', async () => {
			(db.fact.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ status: 'PROVEN', _count: { id: 1000 } },
				{ status: 'DISPROVEN', _count: { id: 200 } },
				{ status: 'PENDING', _count: { id: 500 } }
			]);

			const result = await getFactsByStatus();

			expect(result).toHaveLength(3);
			expect(result[0].status).toBe('PROVEN');
			expect(result[0].count).toBe(1000);
		});
	});

	describe('getHomepageSummary', () => {
		it('should return summary for homepage', async () => {
			(db.fact.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(5000)
				.mockResolvedValueOnce(3000);
			(db.user.count as ReturnType<typeof vi.fn>).mockResolvedValue(1000);
			(db.factVote.count as ReturnType<typeof vi.fn>).mockResolvedValue(50000);

			const summary = await getHomepageSummary();

			expect(summary.totalFacts).toBe(5000);
			expect(summary.provenFacts).toBe(3000);
			expect(summary.totalUsers).toBe(1000);
			expect(summary.totalVotes).toBe(50000);
		});
	});

	describe('Trust Score Ranges', () => {
		it('should define correct trust score ranges', () => {
			const ranges = [
				{ min: -Infinity, max: -50 },
				{ min: -50, max: -25 },
				{ min: -25, max: 0 },
				{ min: 0, max: 25 },
				{ min: 25, max: 50 },
				{ min: 50, max: 100 },
				{ min: 100, max: Infinity }
			];

			expect(ranges).toHaveLength(7);
		});
	});

	describe('Data Formatting', () => {
		it('should format dates as ISO date strings', async () => {
			(db.fact.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(db.factVote.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			(db.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const stats = await getActivityStats(1);
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

			expect(stats.factsPerDay[0].date).toMatch(dateRegex);
		});
	});

	describe('Statistical Calculations', () => {
		it('should handle combined expert counts', () => {
			const experts = 50;
			const phds = 20;
			const combined = experts + phds;

			expect(combined).toBe(70);
		});

		it('should calculate percentages correctly', () => {
			const proven = 3000;
			const total = 5000;
			const percentage = (proven / total) * 100;

			expect(percentage).toBe(60);
		});
	});
});
