import { db } from '../db';
import {
	calculateTrustChange,
	getVoteModifier,
	setCachedTrustPoints,
	setCachedModifiers,
	getDefaultTrustPoints,
	getDefaultTrustModifiers,
	calculateNewTrustScore
} from '$lib/utils/trustScore';
import type { TrustAction, User } from '@prisma/client';

/**
 * Load trust score configuration from database
 * Falls back to defaults if not configured
 */
export async function loadTrustConfig(): Promise<void> {
	try {
		// Load trust point config
		const trustConfigs = await db.trustScoreConfig.findMany();

		if (trustConfigs.length > 0) {
			const points: Record<string, number> = {};
			for (const config of trustConfigs) {
				points[config.action] = config.points;
			}
			setCachedTrustPoints(points as Record<TrustAction, number>);
		}

		// Load trust modifier config
		const modifierConfigs = await db.trustModifierConfig.findMany({
			orderBy: { minTrust: 'desc' }
		});

		if (modifierConfigs.length > 0) {
			setCachedModifiers(
				modifierConfigs.map((c) => ({
					minTrust: c.minTrust,
					maxTrust: c.maxTrust,
					modifier: c.modifier
				}))
			);
		}
	} catch (error) {
		console.warn('Failed to load trust config from database, using defaults:', error);
	}
}

/**
 * Initialize trust score config in database with defaults
 */
export async function initializeTrustConfig(): Promise<void> {
	const defaultPoints = getDefaultTrustPoints();

	// Create trust point configs if they don't exist
	for (const [action, points] of Object.entries(defaultPoints)) {
		await db.trustScoreConfig.upsert({
			where: { action: action as TrustAction },
			create: { action: action as TrustAction, points },
			update: {}
		});
	}

	// Create trust modifier configs if they don't exist
	const defaultModifiers = getDefaultTrustModifiers();
	const existingModifiers = await db.trustModifierConfig.count();

	if (existingModifiers === 0) {
		for (const modifier of defaultModifiers) {
			if (modifier.minTrust !== -Infinity) {
				await db.trustModifierConfig.create({
					data: {
						minTrust: modifier.minTrust,
						maxTrust: modifier.maxTrust,
						modifier: modifier.modifier
					}
				});
			}
		}
	}
}

/**
 * Update a user's trust score based on an action
 */
export async function updateUserTrustScore(
	userId: string,
	action: TrustAction
): Promise<{ user: User; change: number; newScore: number }> {
	const user = await db.user.findUnique({ where: { id: userId } });

	if (!user) {
		throw new Error('User not found');
	}

	const change = calculateTrustChange(action);
	const newScore = user.trustScore + change;

	const updatedUser = await db.user.update({
		where: { id: userId },
		data: { trustScore: newScore }
	});

	return {
		user: updatedUser,
		change,
		newScore
	};
}

/**
 * Get a user's current vote modifier
 */
export async function getUserVoteModifier(userId: string): Promise<number> {
	const user = await db.user.findUnique({ where: { id: userId } });

	if (!user) {
		throw new Error('User not found');
	}

	return getVoteModifier(user.trustScore);
}

/**
 * Get trust score configuration from database
 */
export async function getTrustScoreConfig(): Promise<Record<TrustAction, number>> {
	const configs = await db.trustScoreConfig.findMany();

	const result: Partial<Record<TrustAction, number>> = {};
	for (const config of configs) {
		result[config.action] = config.points;
	}

	// Fill in defaults for any missing actions
	const defaults = getDefaultTrustPoints();
	for (const [action, points] of Object.entries(defaults)) {
		if (!(action in result)) {
			result[action as TrustAction] = points;
		}
	}

	return result as Record<TrustAction, number>;
}

/**
 * Update trust score configuration in database
 */
export async function updateTrustScoreConfig(
	action: TrustAction,
	points: number
): Promise<void> {
	await db.trustScoreConfig.upsert({
		where: { action },
		create: { action, points },
		update: { points }
	});

	// Reload cache
	await loadTrustConfig();
}

/**
 * Get trust modifier configuration from database
 */
export async function getTrustModifierConfig(): Promise<
	Array<{ id: string; minTrust: number; maxTrust: number | null; modifier: number }>
> {
	return db.trustModifierConfig.findMany({
		orderBy: { minTrust: 'desc' }
	});
}

/**
 * Update trust modifier configuration in database
 */
export async function updateTrustModifierConfig(
	id: string,
	modifier: number
): Promise<void> {
	await db.trustModifierConfig.update({
		where: { id },
		data: { modifier }
	});

	// Reload cache
	await loadTrustConfig();
}

/**
 * Batch update trust scores for multiple users
 */
export async function batchUpdateTrustScores(
	updates: Array<{ userId: string; action: TrustAction }>
): Promise<void> {
	for (const update of updates) {
		await updateUserTrustScore(update.userId, update.action);
	}
}

/**
 * Get users by trust score range
 */
export async function getUsersByTrustRange(
	minTrust: number,
	maxTrust?: number
): Promise<User[]> {
	return db.user.findMany({
		where: {
			trustScore: {
				gte: minTrust,
				...(maxTrust !== undefined && { lte: maxTrust })
			},
			deletedAt: null
		},
		orderBy: { trustScore: 'desc' }
	});
}

/**
 * Get top trusted users
 */
export async function getTopTrustedUsers(limit: number = 10): Promise<User[]> {
	return db.user.findMany({
		where: { deletedAt: null },
		orderBy: { trustScore: 'desc' },
		take: limit
	});
}

/**
 * Calculate what a user's new trust score would be after an action
 * (without actually updating it)
 */
export function previewTrustChange(
	currentTrustScore: number,
	action: TrustAction
): { change: number; newScore: number; newModifier: number } {
	const change = calculateTrustChange(action);
	const newScore = calculateNewTrustScore(currentTrustScore, action);
	const newModifier = getVoteModifier(newScore);

	return { change, newScore, newModifier };
}
