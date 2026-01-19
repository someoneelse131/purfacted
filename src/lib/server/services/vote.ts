import { db } from '../db';
import {
	calculateVoteWeight,
	setCachedBaseWeights,
	getDefaultBaseWeights
} from '$lib/utils/voteWeight';
import type { UserType, User } from '@prisma/client';

/**
 * Load vote weight configuration from database
 */
export async function loadVoteWeightConfig(): Promise<void> {
	try {
		const configs = await db.voteWeightConfig.findMany();

		if (configs.length > 0) {
			const weights: Record<string, number> = {};
			for (const config of configs) {
				weights[config.userType] = config.baseWeight;
			}
			setCachedBaseWeights(weights as Record<UserType, number>);
		}
	} catch (error) {
		console.warn('Failed to load vote weight config from database, using defaults:', error);
	}
}

/**
 * Initialize vote weight config in database with defaults
 */
export async function initializeVoteWeightConfig(): Promise<void> {
	const defaultWeights = getDefaultBaseWeights();

	for (const [userType, baseWeight] of Object.entries(defaultWeights)) {
		await db.voteWeightConfig.upsert({
			where: { userType: userType as UserType },
			create: { userType: userType as UserType, baseWeight },
			update: {}
		});
	}
}

/**
 * Get vote weight configuration from database
 */
export async function getVoteWeightConfig(): Promise<Record<UserType, number>> {
	const configs = await db.voteWeightConfig.findMany();

	const result: Partial<Record<UserType, number>> = {};
	for (const config of configs) {
		result[config.userType] = config.baseWeight;
	}

	// Fill in defaults for any missing types
	const defaults = getDefaultBaseWeights();
	for (const [userType, weight] of Object.entries(defaults)) {
		if (!(userType in result)) {
			result[userType as UserType] = weight;
		}
	}

	return result as Record<UserType, number>;
}

/**
 * Update vote weight configuration in database
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

	// Reload cache
	await loadVoteWeightConfig();
}

/**
 * Get a user's current vote weight
 */
export async function getUserVoteWeight(userId: string): Promise<number> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new Error('User not found');
	}

	return calculateVoteWeight(user.userType, user.trustScore);
}

/**
 * Get vote weight for a user object (without DB lookup)
 */
export function getVoteWeightForUser(user: Pick<User, 'userType' | 'trustScore'>): number {
	return calculateVoteWeight(user.userType, user.trustScore);
}

/**
 * Compare voting power between users
 */
export async function compareUserVotingPower(
	userId1: string,
	userId2: string
): Promise<{ user1Weight: number; user2Weight: number; difference: number }> {
	const [user1, user2] = await Promise.all([
		db.user.findUnique({ where: { id: userId1 } }),
		db.user.findUnique({ where: { id: userId2 } })
	]);

	if (!user1 || !user2) {
		throw new Error('One or both users not found');
	}

	const user1Weight = calculateVoteWeight(user1.userType, user1.trustScore);
	const user2Weight = calculateVoteWeight(user2.userType, user2.trustScore);

	return {
		user1Weight,
		user2Weight,
		difference: user1Weight - user2Weight
	};
}

/**
 * Get all users sorted by voting power
 */
export async function getUsersByVotingPower(
	limit: number = 50
): Promise<Array<User & { voteWeight: number }>> {
	const users = await db.user.findMany({
		where: { deletedAt: null },
		take: limit * 2 // Fetch more to account for filtering
	});

	const usersWithWeight = users.map((user) => ({
		...user,
		voteWeight: calculateVoteWeight(user.userType, user.trustScore)
	}));

	// Sort by vote weight descending
	usersWithWeight.sort((a, b) => b.voteWeight - a.voteWeight);

	return usersWithWeight.slice(0, limit);
}

/**
 * Calculate total voting power for a group of users
 */
export function calculateTotalVotingPower(
	users: Array<Pick<User, 'userType' | 'trustScore'>>
): number {
	return users.reduce((total, user) => {
		return total + calculateVoteWeight(user.userType, user.trustScore);
	}, 0);
}

/**
 * Get voting power statistics
 */
export async function getVotingPowerStats(): Promise<{
	totalPower: number;
	averagePower: number;
	medianPower: number;
	powerByUserType: Record<UserType, { count: number; totalPower: number; avgPower: number }>;
}> {
	const users = await db.user.findMany({
		where: { deletedAt: null }
	});

	const weights = users.map((user) => calculateVoteWeight(user.userType, user.trustScore));
	const totalPower = weights.reduce((a, b) => a + b, 0);
	const averagePower = weights.length > 0 ? totalPower / weights.length : 0;

	// Calculate median
	const sortedWeights = [...weights].sort((a, b) => a - b);
	const mid = Math.floor(sortedWeights.length / 2);
	const medianPower =
		sortedWeights.length % 2 !== 0
			? sortedWeights[mid]
			: (sortedWeights[mid - 1] + sortedWeights[mid]) / 2;

	// Power by user type
	const powerByUserType: Record<
		UserType,
		{ count: number; totalPower: number; avgPower: number }
	> = {} as any;

	const userTypes: UserType[] = [
		'ANONYMOUS',
		'VERIFIED',
		'EXPERT',
		'PHD',
		'ORGANIZATION',
		'MODERATOR'
	];

	for (const type of userTypes) {
		const typeUsers = users.filter((u) => u.userType === type);
		const typePowers = typeUsers.map((u) => calculateVoteWeight(u.userType, u.trustScore));
		const typeTotal = typePowers.reduce((a, b) => a + b, 0);

		powerByUserType[type] = {
			count: typeUsers.length,
			totalPower: typeTotal,
			avgPower: typeUsers.length > 0 ? typeTotal / typeUsers.length : 0
		};
	}

	return {
		totalPower,
		averagePower,
		medianPower: medianPower || 0,
		powerByUserType
	};
}
