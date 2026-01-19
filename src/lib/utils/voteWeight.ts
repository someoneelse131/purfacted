import type { UserType } from '@prisma/client';
import { getVoteModifier } from './trustScore';

// Default base weights by user type (can be overridden by database config)
const DEFAULT_BASE_WEIGHTS: Record<UserType, number> = {
	ANONYMOUS: parseFloat(process.env.VOTE_WEIGHT_ANONYMOUS || '0.1'),
	VERIFIED: parseFloat(process.env.VOTE_WEIGHT_VERIFIED || '2'),
	EXPERT: parseFloat(process.env.VOTE_WEIGHT_EXPERT || '5'),
	PHD: parseFloat(process.env.VOTE_WEIGHT_PHD || '8'),
	ORGANIZATION: parseFloat(process.env.VOTE_WEIGHT_ORGANIZATION || '100'),
	MODERATOR: parseFloat(process.env.VOTE_WEIGHT_MODERATOR || '3')
};

// Cache for database-loaded config
let cachedBaseWeights: Record<UserType, number> | null = null;

/**
 * Get base vote weight for a user type
 */
export function getBaseVoteWeight(userType: UserType, dbConfig?: Record<UserType, number>): number {
	if (dbConfig) {
		return dbConfig[userType] ?? DEFAULT_BASE_WEIGHTS[userType];
	}
	if (cachedBaseWeights) {
		return cachedBaseWeights[userType] ?? DEFAULT_BASE_WEIGHTS[userType];
	}
	return DEFAULT_BASE_WEIGHTS[userType];
}

/**
 * Calculate final vote weight
 * Final weight = baseWeight * trustModifier
 */
export function calculateVoteWeight(
	userType: UserType,
	trustScore: number,
	dbConfig?: Record<UserType, number>
): number {
	const baseWeight = getBaseVoteWeight(userType, dbConfig);
	const trustModifier = getVoteModifier(trustScore);

	return baseWeight * trustModifier;
}

/**
 * Set cached base weights from database
 */
export function setCachedBaseWeights(weights: Record<UserType, number>): void {
	cachedBaseWeights = weights;
}

/**
 * Clear cached config (for testing or reload)
 */
export function clearVoteWeightCache(): void {
	cachedBaseWeights = null;
}

/**
 * Get all default base weights
 */
export function getDefaultBaseWeights(): Record<UserType, number> {
	return { ...DEFAULT_BASE_WEIGHTS };
}

/**
 * Get user type display name
 */
export function getUserTypeDisplayName(userType: UserType): string {
	const names: Record<UserType, string> = {
		ANONYMOUS: 'Anonymous',
		VERIFIED: 'Verified User',
		EXPERT: 'Expert',
		PHD: 'PhD',
		ORGANIZATION: 'Organization',
		MODERATOR: 'Moderator'
	};
	return names[userType];
}

/**
 * Get user type badge color (for UI)
 */
export function getUserTypeBadgeColor(userType: UserType): string {
	const colors: Record<UserType, string> = {
		ANONYMOUS: 'gray',
		VERIFIED: 'green',
		EXPERT: 'yellow',
		PHD: 'purple',
		ORGANIZATION: 'blue',
		MODERATOR: 'orange'
	};
	return colors[userType];
}

/**
 * Get the next user type upgrade path
 */
export function getNextUserTypeUpgrade(currentType: UserType): UserType | null {
	const upgradePath: Partial<Record<UserType, UserType>> = {
		ANONYMOUS: 'VERIFIED',
		VERIFIED: 'EXPERT',
		EXPERT: 'PHD'
	};
	return upgradePath[currentType] || null;
}

/**
 * Check if a user type can verify expert credentials
 */
export function canVerifyExperts(userType: UserType): boolean {
	return ['VERIFIED', 'EXPERT', 'PHD', 'MODERATOR'].includes(userType);
}

/**
 * Calculate weighted vote value for display
 * Returns a formatted string showing the vote impact
 */
export function formatVoteWeight(weight: number): string {
	if (weight >= 10) {
		return weight.toFixed(0);
	}
	if (weight >= 1) {
		return weight.toFixed(1);
	}
	return weight.toFixed(2);
}

/**
 * Compare vote weights between two users
 */
export function compareVoteWeights(
	user1: { userType: UserType; trustScore: number },
	user2: { userType: UserType; trustScore: number }
): number {
	const weight1 = calculateVoteWeight(user1.userType, user1.trustScore);
	const weight2 = calculateVoteWeight(user2.userType, user2.trustScore);
	return weight1 - weight2;
}
