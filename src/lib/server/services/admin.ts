/**
 * R48: Admin Configuration Service
 *
 * System configuration and admin management.
 */

import { db } from '../db';
import type { User, TrustAction, UserType } from '@prisma/client';

export class AdminError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'AdminError';
		this.code = code;
	}
}

// Feature flags (in production, store in database or Redis)
const featureFlags: Map<string, boolean> = new Map([
	['anonymous_voting', true],
	['expert_verification', true],
	['debates', true],
	['veto_system', true],
	['email_notifications', true],
	['grammar_check', true],
	['duplicate_detection', true],
	['user_trust_voting', true]
]);

/**
 * Check if user is an admin (has MODERATOR type for now)
 */
export async function isAdmin(userId: string): Promise<boolean> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	// For now, moderators are admins. In production, add an admin field
	return user?.userType === 'MODERATOR';
}

// ====================================
// Trust Score Configuration
// ====================================

/**
 * Get trust score configuration
 */
export async function getTrustConfig(): Promise<Record<TrustAction, number>> {
	const configs = await db.trustScoreConfig.findMany();

	const result: Record<string, number> = {};
	for (const config of configs) {
		result[config.action] = config.points;
	}

	return result as Record<TrustAction, number>;
}

/**
 * Update trust score configuration
 */
export async function updateTrustConfig(
	action: TrustAction,
	points: number
): Promise<void> {
	await db.trustScoreConfig.upsert({
		where: { action },
		create: { action, points },
		update: { points }
	});
}

// ====================================
// Vote Weight Configuration
// ====================================

/**
 * Get vote weight configuration
 */
export async function getVoteWeightConfig(): Promise<Record<UserType, number>> {
	const configs = await db.voteWeightConfig.findMany();

	const result: Record<string, number> = {};
	for (const config of configs) {
		result[config.userType] = config.baseWeight;
	}

	return result as Record<UserType, number>;
}

/**
 * Update vote weight configuration
 */
export async function updateVoteWeightConfig(
	userType: UserType,
	baseWeight: number
): Promise<void> {
	await db.voteWeightConfig.upsert({
		where: { userType },
		create: { userType, baseWeight },
		update: { baseWeight }
	});
}

// ====================================
// Trust Modifier Configuration
// ====================================

/**
 * Get trust modifier configuration
 */
export async function getTrustModifierConfig(): Promise<
	{ minTrust: number; maxTrust: number | null; modifier: number }[]
> {
	return db.trustModifierConfig.findMany({
		orderBy: { minTrust: 'asc' }
	});
}

/**
 * Update trust modifier configuration
 */
export async function updateTrustModifierConfig(
	id: string,
	modifier: number
): Promise<void> {
	await db.trustModifierConfig.update({
		where: { id },
		data: { modifier }
	});
}

// ====================================
// Feature Flags
// ====================================

/**
 * Get all feature flags
 */
export function getFeatureFlags(): Record<string, boolean> {
	const result: Record<string, boolean> = {};
	for (const [key, value] of featureFlags) {
		result[key] = value;
	}
	return result;
}

/**
 * Get a specific feature flag
 */
export function getFeatureFlag(flag: string): boolean {
	return featureFlags.get(flag) ?? false;
}

/**
 * Update a feature flag
 */
export function setFeatureFlag(flag: string, enabled: boolean): void {
	featureFlags.set(flag, enabled);
}

// ====================================
// User Management
// ====================================

/**
 * Promote user to moderator
 */
export async function promoteToModerator(
	userId: string,
	adminId: string
): Promise<User> {
	const admin = await isAdmin(adminId);
	if (!admin) {
		throw new AdminError('Not authorized', 'NOT_ADMIN');
	}

	const user = await db.user.findUnique({ where: { id: userId } });
	if (!user) {
		throw new AdminError('User not found', 'NOT_FOUND');
	}

	if (user.userType === 'MODERATOR') {
		throw new AdminError('User is already a moderator', 'ALREADY_MODERATOR');
	}

	return db.user.update({
		where: { id: userId },
		data: { userType: 'MODERATOR' }
	});
}

/**
 * Demote moderator to verified user
 */
export async function demoteFromModerator(
	userId: string,
	adminId: string
): Promise<User> {
	const admin = await isAdmin(adminId);
	if (!admin) {
		throw new AdminError('Not authorized', 'NOT_ADMIN');
	}

	const user = await db.user.findUnique({ where: { id: userId } });
	if (!user) {
		throw new AdminError('User not found', 'NOT_FOUND');
	}

	if (user.userType !== 'MODERATOR') {
		throw new AdminError('User is not a moderator', 'NOT_MODERATOR');
	}

	return db.user.update({
		where: { id: userId },
		data: { userType: 'VERIFIED' }
	});
}

/**
 * Set user type (admin override)
 */
export async function setUserType(
	userId: string,
	userType: UserType,
	adminId: string
): Promise<User> {
	const admin = await isAdmin(adminId);
	if (!admin) {
		throw new AdminError('Not authorized', 'NOT_ADMIN');
	}

	return db.user.update({
		where: { id: userId },
		data: { userType }
	});
}

/**
 * Adjust user trust score (admin override)
 */
export async function adjustTrustScore(
	userId: string,
	adjustment: number,
	adminId: string,
	reason: string
): Promise<User> {
	const admin = await isAdmin(adminId);
	if (!admin) {
		throw new AdminError('Not authorized', 'NOT_ADMIN');
	}

	const user = await db.user.findUnique({ where: { id: userId } });
	if (!user) {
		throw new AdminError('User not found', 'NOT_FOUND');
	}

	return db.user.update({
		where: { id: userId },
		data: {
			trustScore: user.trustScore + adjustment
		}
	});
}

// ====================================
// System Health
// ====================================

/**
 * Get system health metrics
 */
export async function getSystemHealth(): Promise<{
	database: { status: string; latency: number };
	queues: {
		moderation: number;
		pendingVerifications: number;
		pendingReports: number;
	};
	users: {
		active24h: number;
		newToday: number;
	};
}> {
	const now = new Date();
	const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const today = new Date(now.setHours(0, 0, 0, 0));

	// Check database latency
	const dbStart = Date.now();
	await db.user.count();
	const dbLatency = Date.now() - dbStart;

	// Get queue sizes
	const [moderationQueue, pendingVerifications, pendingReports] = await Promise.all([
		db.moderationQueueItem.count({ where: { status: 'PENDING' } }),
		db.expertVerification.count({ where: { status: 'PENDING' } }),
		db.report.count({ where: { status: 'PENDING' } })
	]);

	// Get user activity
	const [activeUsers, newUsers] = await Promise.all([
		db.user.count({
			where: {
				lastLoginAt: { gte: yesterday },
				deletedAt: null
			}
		}),
		db.user.count({
			where: {
				createdAt: { gte: today },
				deletedAt: null
			}
		})
	]);

	return {
		database: {
			status: dbLatency < 1000 ? 'healthy' : 'degraded',
			latency: dbLatency
		},
		queues: {
			moderation: moderationQueue,
			pendingVerifications,
			pendingReports
		},
		users: {
			active24h: activeUsers,
			newToday: newUsers
		}
	};
}

// ====================================
// Configuration Summary
// ====================================

/**
 * Get all configuration for admin panel
 */
export async function getAdminConfig(): Promise<{
	trustConfig: Record<TrustAction, number>;
	voteWeightConfig: Record<UserType, number>;
	trustModifiers: { minTrust: number; maxTrust: number | null; modifier: number }[];
	featureFlags: Record<string, boolean>;
	systemHealth: Awaited<ReturnType<typeof getSystemHealth>>;
}> {
	const [trustConfig, voteWeightConfig, trustModifiers, systemHealth] = await Promise.all([
		getTrustConfig(),
		getVoteWeightConfig(),
		getTrustModifierConfig(),
		getSystemHealth()
	]);

	return {
		trustConfig,
		voteWeightConfig,
		trustModifiers,
		featureFlags: getFeatureFlags(),
		systemHealth
	};
}
