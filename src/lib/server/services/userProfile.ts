/**
 * R40: User Profile Public View Service
 *
 * Public user profiles with stats and privacy settings.
 */

import { db } from '../db';
import type { User } from '@prisma/client';

export class ProfileError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'ProfileError';
		this.code = code;
	}
}

export interface PublicProfile {
	id: string;
	firstName: string;
	lastName: string;
	userType: string;
	trustScore: number;
	joinDate: Date;
	verificationBadge?: {
		type: string;
		verifiers: string[];
	};
	stats: {
		factsPosted: number;
		factsProven: number;
		factsDisproven: number;
		accuracyRate: number;
		expertiseFields: string[];
	};
	recentActivity: {
		type: string;
		title: string;
		date: Date;
	}[];
}

export interface ProfilePrivacySettings {
	showTrustScore: boolean;
	showStats: boolean;
	showRecentActivity: boolean;
	showExpertiseFields: boolean;
}

const DEFAULT_PRIVACY: ProfilePrivacySettings = {
	showTrustScore: true,
	showStats: true,
	showRecentActivity: true,
	showExpertiseFields: true
};

/**
 * Get user's privacy settings (or defaults)
 */
export async function getPrivacySettings(userId: string): Promise<ProfilePrivacySettings> {
	// In production, store these in a separate table
	// For now, return defaults
	return DEFAULT_PRIVACY;
}

/**
 * Update user's privacy settings
 */
export async function updatePrivacySettings(
	userId: string,
	settings: Partial<ProfilePrivacySettings>
): Promise<ProfilePrivacySettings> {
	// In production, update the database
	return { ...DEFAULT_PRIVACY, ...settings };
}

/**
 * Get public profile for a user
 */
export async function getPublicProfile(
	userId: string,
	viewerId?: string
): Promise<PublicProfile | null> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user || user.deletedAt) {
		return null;
	}

	const privacy = await getPrivacySettings(userId);

	// Get verification badge
	let verificationBadge: PublicProfile['verificationBadge'] | undefined;
	if (user.userType === 'EXPERT' || user.userType === 'PHD') {
		const verification = await db.expertVerification.findFirst({
			where: { userId, status: 'APPROVED' },
			include: {
				reviews: {
					where: { approved: true },
					include: {
						reviewer: {
							select: { firstName: true, lastName: true }
						}
					}
				}
			}
		});

		if (verification) {
			verificationBadge = {
				type: verification.type,
				verifiers: verification.reviews.map(
					(r) => `${r.reviewer.firstName} ${r.reviewer.lastName[0]}.`
				)
			};
		}
	}

	// Get fact statistics
	const [factsPosted, factsProven, factsDisproven] = await Promise.all([
		db.fact.count({ where: { userId } }),
		db.fact.count({ where: { userId, status: 'PROVEN' } }),
		db.fact.count({ where: { userId, status: 'DISPROVEN' } })
	]);

	const accuracyRate =
		factsPosted > 0
			? Math.round((factsProven / factsPosted) * 100)
			: 0;

	// Get expertise fields from verifications
	const verifications = await db.expertVerification.findMany({
		where: { userId, status: 'APPROVED' },
		select: { field: true }
	});
	const expertiseFields = verifications.map((v) => v.field);

	// Get recent public activity (facts)
	const recentFacts = await db.fact.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		take: 5,
		select: {
			id: true,
			title: true,
			createdAt: true
		}
	});

	const recentActivity = recentFacts.map((f) => ({
		type: 'fact',
		title: f.title,
		date: f.createdAt
	}));

	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName[0] + '.', // Privacy: only show initial
		userType: user.userType,
		trustScore: privacy.showTrustScore ? user.trustScore : -1,
		joinDate: user.createdAt,
		verificationBadge,
		stats: privacy.showStats
			? {
					factsPosted,
					factsProven,
					factsDisproven,
					accuracyRate,
					expertiseFields: privacy.showExpertiseFields ? expertiseFields : []
				}
			: {
					factsPosted: -1,
					factsProven: -1,
					factsDisproven: -1,
					accuracyRate: -1,
					expertiseFields: []
				},
		recentActivity: privacy.showRecentActivity ? recentActivity : []
	};
}

/**
 * Get full profile for the user themselves
 */
export async function getOwnProfile(userId: string): Promise<User | null> {
	return db.user.findUnique({
		where: { id: userId }
	});
}

/**
 * Search for users by name
 */
export async function searchUsers(
	query: string,
	limit: number = 20,
	offset: number = 0
): Promise<{ id: string; firstName: string; lastName: string; userType: string }[]> {
	const users = await db.user.findMany({
		where: {
			deletedAt: null,
			OR: [
				{ firstName: { contains: query, mode: 'insensitive' } },
				{ lastName: { contains: query, mode: 'insensitive' } }
			]
		},
		select: {
			id: true,
			firstName: true,
			lastName: true,
			userType: true
		},
		orderBy: { trustScore: 'desc' },
		take: limit,
		skip: offset
	});

	return users;
}

/**
 * Get top contributors by trust score
 */
export async function getTopContributors(limit: number = 10): Promise<{
	id: string;
	firstName: string;
	lastName: string;
	userType: string;
	trustScore: number;
	factsPosted: number;
}[]> {
	const users = await db.user.findMany({
		where: {
			deletedAt: null,
			userType: { notIn: ['ANONYMOUS', 'ORGANIZATION'] }
		},
		orderBy: { trustScore: 'desc' },
		take: limit,
		select: {
			id: true,
			firstName: true,
			lastName: true,
			userType: true,
			trustScore: true,
			_count: {
				select: { facts: true }
			}
		}
	});

	return users.map((u) => ({
		id: u.id,
		firstName: u.firstName,
		lastName: u.lastName[0] + '.',
		userType: u.userType,
		trustScore: u.trustScore,
		factsPosted: u._count.facts
	}));
}

/**
 * Get user badge for display
 */
export function getUserBadge(userType: string): {
	label: string;
	color: string;
} {
	const badges: Record<string, { label: string; color: string }> = {
		VERIFIED: { label: 'Verified', color: 'blue' },
		EXPERT: { label: 'Expert', color: 'green' },
		PHD: { label: 'PhD', color: 'purple' },
		ORGANIZATION: { label: 'Organization', color: 'orange' },
		MODERATOR: { label: 'Moderator', color: 'red' },
		ANONYMOUS: { label: 'Anonymous', color: 'gray' }
	};

	return badges[userType] || badges['VERIFIED'];
}

/**
 * Get profile statistics summary
 */
export async function getProfileStats(): Promise<{
	totalUsers: number;
	verifiedUsers: number;
	experts: number;
	organizations: number;
	moderators: number;
}> {
	const [totalUsers, verifiedUsers, experts, phds, organizations, moderators] = await Promise.all([
		db.user.count({ where: { deletedAt: null } }),
		db.user.count({ where: { deletedAt: null, userType: 'VERIFIED' } }),
		db.user.count({ where: { deletedAt: null, userType: 'EXPERT' } }),
		db.user.count({ where: { deletedAt: null, userType: 'PHD' } }),
		db.user.count({ where: { deletedAt: null, userType: 'ORGANIZATION' } }),
		db.user.count({ where: { deletedAt: null, userType: 'MODERATOR' } })
	]);

	return {
		totalUsers,
		verifiedUsers,
		experts: experts + phds,
		organizations,
		moderators
	};
}
