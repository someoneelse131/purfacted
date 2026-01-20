/**
 * R47: Statistics Service
 *
 * Platform-wide statistics and analytics.
 */

import { db } from '../db';

export interface PlatformStats {
	users: {
		total: number;
		verified: number;
		experts: number;
		organizations: number;
		moderators: number;
		newThisWeek: number;
	};
	facts: {
		total: number;
		proven: number;
		disproven: number;
		controversial: number;
		underVetoReview: number;
		submitted: number;
		newThisWeek: number;
	};
	votes: {
		total: number;
		thisWeek: number;
	};
	debates: {
		total: number;
		published: number;
		thisWeek: number;
	};
	categories: {
		total: number;
		mostPopular: { name: string; factCount: number }[];
	};
}

export interface ActivityStats {
	factsPerDay: { date: string; count: number }[];
	votesPerDay: { date: string; count: number }[];
	usersPerDay: { date: string; count: number }[];
}

export interface TrustDistribution {
	ranges: { min: number; max: number; count: number }[];
	average: number;
	median: number;
}

export interface TopContributor {
	id: string;
	firstName: string;
	lastName: string;
	userType: string;
	trustScore: number;
	factCount: number;
}

/**
 * Get overall platform statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
	const weekAgo = new Date();
	weekAgo.setDate(weekAgo.getDate() - 7);

	const [
		totalUsers,
		verifiedUsers,
		experts,
		phds,
		organizations,
		moderators,
		newUsersThisWeek,
		totalFacts,
		provenFacts,
		disprovenFacts,
		controversialFacts,
		underVetoReviewFacts,
		submittedFacts,
		newFactsThisWeek,
		totalVotes,
		votesThisWeek,
		totalDebates,
		publishedDebates,
		debatesThisWeek,
		totalCategories
	] = await Promise.all([
		db.user.count({ where: { deletedAt: null } }),
		db.user.count({ where: { deletedAt: null, userType: 'VERIFIED' } }),
		db.user.count({ where: { deletedAt: null, userType: 'EXPERT' } }),
		db.user.count({ where: { deletedAt: null, userType: 'PHD' } }),
		db.user.count({ where: { deletedAt: null, userType: 'ORGANIZATION' } }),
		db.user.count({ where: { deletedAt: null, userType: 'MODERATOR' } }),
		db.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
		db.fact.count(),
		db.fact.count({ where: { status: 'PROVEN' } }),
		db.fact.count({ where: { status: 'DISPROVEN' } }),
		db.fact.count({ where: { status: 'CONTROVERSIAL' } }),
		db.fact.count({ where: { status: 'UNDER_VETO_REVIEW' } }),
		db.fact.count({ where: { status: 'SUBMITTED' } }),
		db.fact.count({ where: { createdAt: { gte: weekAgo } } }),
		db.factVote.count(),
		db.factVote.count({ where: { createdAt: { gte: weekAgo } } }),
		db.debate.count(),
		db.debate.count({ where: { status: 'PUBLISHED' } }),
		db.debate.count({ where: { createdAt: { gte: weekAgo } } }),
		db.category.count({ where: { deletedAt: null } })
	]);

	// Get most popular categories
	const categoryStats = await db.category.findMany({
		where: { deletedAt: null },
		include: {
			_count: {
				select: { facts: true }
			}
		},
		orderBy: {
			facts: {
				_count: 'desc'
			}
		},
		take: 10
	});

	const mostPopular = categoryStats.map((c) => ({
		name: c.name,
		factCount: c._count.facts
	}));

	return {
		users: {
			total: totalUsers,
			verified: verifiedUsers,
			experts: experts + phds,
			organizations,
			moderators,
			newThisWeek: newUsersThisWeek
		},
		facts: {
			total: totalFacts,
			proven: provenFacts,
			disproven: disprovenFacts,
			controversial: controversialFacts,
			underVetoReview: underVetoReviewFacts,
			submitted: submittedFacts,
			newThisWeek: newFactsThisWeek
		},
		votes: {
			total: totalVotes,
			thisWeek: votesThisWeek
		},
		debates: {
			total: totalDebates,
			published: publishedDebates,
			thisWeek: debatesThisWeek
		},
		categories: {
			total: totalCategories,
			mostPopular
		}
	};
}

/**
 * Get activity over time (last 30 days)
 */
export async function getActivityStats(days: number = 30): Promise<ActivityStats> {
	const since = new Date();
	since.setDate(since.getDate() - days);
	since.setHours(0, 0, 0, 0);

	// Generate date range
	const dates: string[] = [];
	for (let i = days; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		dates.push(date.toISOString().split('T')[0]);
	}

	// Get facts grouped by day
	const facts = await db.fact.findMany({
		where: { createdAt: { gte: since }, deletedAt: null },
		select: { createdAt: true }
	});

	const factsByDay = new Map<string, number>();
	for (const fact of facts) {
		const date = fact.createdAt.toISOString().split('T')[0];
		factsByDay.set(date, (factsByDay.get(date) || 0) + 1);
	}

	// Get votes grouped by day
	const votes = await db.factVote.findMany({
		where: { createdAt: { gte: since } },
		select: { createdAt: true }
	});

	const votesByDay = new Map<string, number>();
	for (const vote of votes) {
		const date = vote.createdAt.toISOString().split('T')[0];
		votesByDay.set(date, (votesByDay.get(date) || 0) + 1);
	}

	// Get users grouped by day
	const users = await db.user.findMany({
		where: { createdAt: { gte: since }, deletedAt: null },
		select: { createdAt: true }
	});

	const usersByDay = new Map<string, number>();
	for (const user of users) {
		const date = user.createdAt.toISOString().split('T')[0];
		usersByDay.set(date, (usersByDay.get(date) || 0) + 1);
	}

	return {
		factsPerDay: dates.map((date) => ({ date, count: factsByDay.get(date) || 0 })),
		votesPerDay: dates.map((date) => ({ date, count: votesByDay.get(date) || 0 })),
		usersPerDay: dates.map((date) => ({ date, count: usersByDay.get(date) || 0 }))
	};
}

/**
 * Get trust score distribution
 */
export async function getTrustDistribution(): Promise<TrustDistribution> {
	const users = await db.user.findMany({
		where: { deletedAt: null },
		select: { trustScore: true }
	});

	const scores = users.map((u) => u.trustScore).sort((a, b) => a - b);

	// Define ranges
	const ranges = [
		{ min: -Infinity, max: -50, count: 0 },
		{ min: -50, max: -25, count: 0 },
		{ min: -25, max: 0, count: 0 },
		{ min: 0, max: 25, count: 0 },
		{ min: 25, max: 50, count: 0 },
		{ min: 50, max: 100, count: 0 },
		{ min: 100, max: Infinity, count: 0 }
	];

	// Count users in each range
	for (const score of scores) {
		for (const range of ranges) {
			if (score > range.min && score <= range.max) {
				range.count++;
				break;
			}
		}
	}

	// Calculate average and median
	const sum = scores.reduce((a, b) => a + b, 0);
	const average = scores.length > 0 ? sum / scores.length : 0;
	const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)] : 0;

	return {
		ranges,
		average: Math.round(average * 100) / 100,
		median
	};
}

/**
 * Get top contributors by trust score
 */
export async function getTopContributors(limit: number = 10): Promise<TopContributor[]> {
	const users = await db.user.findMany({
		where: {
			deletedAt: null,
			userType: { notIn: ['ANONYMOUS', 'ORGANIZATION'] }
		},
		include: {
			_count: {
				select: { facts: true }
			}
		},
		orderBy: { trustScore: 'desc' },
		take: limit
	});

	return users.map((u) => ({
		id: u.id,
		firstName: u.firstName,
		lastName: u.lastName[0] + '.',
		userType: u.userType,
		trustScore: u.trustScore,
		factCount: u._count.facts
	}));
}

/**
 * Get facts by category (pie chart data)
 */
export async function getFactsByCategory(): Promise<{ category: string; count: number }[]> {
	const categories = await db.category.findMany({
		where: { deletedAt: null },
		include: {
			_count: {
				select: { facts: true }
			}
		},
		orderBy: {
			facts: {
				_count: 'desc'
			}
		},
		take: 10
	});

	return categories.map((c) => ({
		category: c.name,
		count: c._count.facts
	}));
}

/**
 * Get facts by status (pie chart data)
 */
export async function getFactsByStatus(): Promise<{ status: string; count: number }[]> {
	const statuses = await db.fact.groupBy({
		by: ['status'],
		_count: { id: true }
	});

	return statuses.map((s) => ({
		status: s.status,
		count: s._count.id
	}));
}

/**
 * Get summary for homepage
 */
export async function getHomepageSummary(): Promise<{
	totalFacts: number;
	provenFacts: number;
	totalUsers: number;
	totalVotes: number;
}> {
	const [totalFacts, provenFacts, totalUsers, totalVotes] = await Promise.all([
		db.fact.count(),
		db.fact.count({ where: { status: 'PROVEN' } }),
		db.user.count({ where: { deletedAt: null } }),
		db.factVote.count()
	]);

	return {
		totalFacts,
		provenFacts,
		totalUsers,
		totalVotes
	};
}
