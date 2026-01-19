import type { TrustAction, UserType } from '@prisma/client';

// Default trust score point values (can be overridden by database config)
const DEFAULT_TRUST_POINTS: Record<TrustAction, number> = {
	FACT_APPROVED: parseInt(process.env.TRUST_FACT_APPROVED || '10', 10),
	FACT_WRONG: parseInt(process.env.TRUST_FACT_WRONG || '-20', 10),
	FACT_OUTDATED: parseInt(process.env.TRUST_FACT_OUTDATED || '0', 10),
	VETO_SUCCESS: parseInt(process.env.TRUST_VETO_SUCCESS || '5', 10),
	VETO_FAIL: parseInt(process.env.TRUST_VETO_FAIL || '-5', 10),
	VERIFICATION_CORRECT: parseInt(process.env.TRUST_VERIFICATION_CORRECT || '3', 10),
	VERIFICATION_WRONG: parseInt(process.env.TRUST_VERIFICATION_WRONG || '-10', 10),
	UPVOTED: parseInt(process.env.TRUST_UPVOTED || '1', 10),
	DOWNVOTED: parseInt(process.env.TRUST_DOWNVOTED || '-1', 10)
};

// Default vote weight modifiers based on trust score
const DEFAULT_TRUST_MODIFIERS: Array<{ minTrust: number; maxTrust: number | null; modifier: number }> = [
	{ minTrust: 100, maxTrust: null, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_100_PLUS || '1.5') },
	{ minTrust: 50, maxTrust: 99, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_50_99 || '1.2') },
	{ minTrust: 0, maxTrust: 49, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_0_49 || '1.0') },
	{ minTrust: -25, maxTrust: -1, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_NEG1_NEG25 || '0.5') },
	{ minTrust: -50, maxTrust: -26, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_NEG26_NEG50 || '0.25') },
	{ minTrust: -Infinity, maxTrust: -51, modifier: parseFloat(process.env.VOTE_MODIFIER_TRUST_BELOW_NEG50 || '0') }
];

// Cache for database-loaded config
let cachedTrustPoints: Record<TrustAction, number> | null = null;
let cachedModifiers: Array<{ minTrust: number; maxTrust: number | null; modifier: number }> | null = null;

/**
 * Get trust point value for an action
 * Uses database config if loaded, otherwise falls back to env/defaults
 */
export function getTrustPoints(action: TrustAction, dbConfig?: Record<TrustAction, number>): number {
	if (dbConfig) {
		return dbConfig[action] ?? DEFAULT_TRUST_POINTS[action];
	}
	if (cachedTrustPoints) {
		return cachedTrustPoints[action] ?? DEFAULT_TRUST_POINTS[action];
	}
	return DEFAULT_TRUST_POINTS[action];
}

/**
 * Calculate trust score change for a given action
 */
export function calculateTrustChange(action: TrustAction, dbConfig?: Record<TrustAction, number>): number {
	return getTrustPoints(action, dbConfig);
}

/**
 * Get vote weight modifier based on trust score
 * Higher trust = higher modifier (more voting power)
 */
export function getVoteModifier(
	trustScore: number,
	modifiers?: Array<{ minTrust: number; maxTrust: number | null; modifier: number }>
): number {
	const useModifiers = modifiers || cachedModifiers || DEFAULT_TRUST_MODIFIERS;

	for (const config of useModifiers) {
		const maxTrust = config.maxTrust ?? Infinity;
		if (trustScore >= config.minTrust && trustScore <= maxTrust) {
			return config.modifier;
		}
	}

	// Default to 1.0 if no matching range found
	return 1.0;
}

/**
 * Set cached trust points from database
 */
export function setCachedTrustPoints(points: Record<TrustAction, number>): void {
	cachedTrustPoints = points;
}

/**
 * Set cached modifiers from database
 */
export function setCachedModifiers(modifiers: Array<{ minTrust: number; maxTrust: number | null; modifier: number }>): void {
	cachedModifiers = modifiers;
}

/**
 * Clear cached config (for testing or reload)
 */
export function clearTrustScoreCache(): void {
	cachedTrustPoints = null;
	cachedModifiers = null;
}

/**
 * Get all default trust point values
 */
export function getDefaultTrustPoints(): Record<TrustAction, number> {
	return { ...DEFAULT_TRUST_POINTS };
}

/**
 * Get all default trust modifiers
 */
export function getDefaultTrustModifiers(): Array<{ minTrust: number; maxTrust: number | null; modifier: number }> {
	return [...DEFAULT_TRUST_MODIFIERS];
}

/**
 * Calculate new trust score after an action
 */
export function calculateNewTrustScore(
	currentTrustScore: number,
	action: TrustAction,
	dbConfig?: Record<TrustAction, number>
): number {
	const change = calculateTrustChange(action, dbConfig);
	return currentTrustScore + change;
}

/**
 * Determine user's effective voting power description
 */
export function getTrustLevel(trustScore: number): string {
	if (trustScore >= 100) return 'Highly Trusted';
	if (trustScore >= 50) return 'Trusted';
	if (trustScore >= 0) return 'Standard';
	if (trustScore >= -25) return 'Low Trust';
	if (trustScore >= -50) return 'Very Low Trust';
	return 'No Voting Power';
}
