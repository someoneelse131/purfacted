/**
 * R34-R35: Moderator Auto-Election and Inactive Handling
 *
 * Handles automatic moderator promotion/demotion based on trust scores.
 */

import { db } from '../db';
import type { User } from '@prisma/client';

// Configurable thresholds
const BOOTSTRAP_THRESHOLD = parseInt(process.env.MODERATOR_BOOTSTRAP_THRESHOLD || '100', 10);
const EARLY_THRESHOLD = parseInt(process.env.MODERATOR_EARLY_THRESHOLD || '500', 10);
const MIN_TRUSTED_FOR_AUTO = parseInt(process.env.MODERATOR_MIN_TRUSTED || '100', 10);
const TOP_PERCENTAGE = parseFloat(process.env.MODERATOR_TOP_PERCENTAGE || '0.1'); // 10%
const INACTIVE_DAYS = parseInt(process.env.MODERATOR_INACTIVE_DAYS || '30', 10);
const MAX_MODERATORS = parseInt(process.env.MAX_MODERATORS || '50', 10);

export class ModeratorError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'ModeratorError';
		this.code = code;
	}
}

export type ElectionPhase = 'bootstrap' | 'early' | 'mature';

/**
 * Get the current election phase based on user count
 */
export async function getElectionPhase(): Promise<ElectionPhase> {
	const userCount = await db.user.count({
		where: { deletedAt: null, emailVerified: true }
	});

	if (userCount < BOOTSTRAP_THRESHOLD) {
		return 'bootstrap';
	} else if (userCount < EARLY_THRESHOLD) {
		return 'early';
	} else {
		return 'mature';
	}
}

/**
 * Get the minimum trust score required to be in top 10%
 */
export async function getMinTrustForTopPercentage(): Promise<number> {
	const totalUsers = await db.user.count({
		where: { deletedAt: null, emailVerified: true }
	});

	const topCount = Math.max(1, Math.ceil(totalUsers * TOP_PERCENTAGE));

	// Get the Nth user's trust score (where N = topCount)
	const topUsers = await db.user.findMany({
		where: { deletedAt: null, emailVerified: true },
		orderBy: { trustScore: 'desc' },
		take: topCount,
		select: { trustScore: true }
	});

	if (topUsers.length === 0) {
		return 0;
	}

	return topUsers[topUsers.length - 1].trustScore;
}

/**
 * Check if a user is eligible for moderator promotion
 */
export async function isEligibleForModerator(userId: string): Promise<{
	eligible: boolean;
	reason?: string;
}> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		return { eligible: false, reason: 'User not found' };
	}

	if (user.userType === 'MODERATOR') {
		return { eligible: false, reason: 'Already a moderator' };
	}

	if (user.userType === 'ORGANIZATION') {
		return { eligible: false, reason: 'Organizations cannot become moderators' };
	}

	if (!user.emailVerified) {
		return { eligible: false, reason: 'Email not verified' };
	}

	if (user.banLevel > 0) {
		return { eligible: false, reason: 'User is banned' };
	}

	const phase = await getElectionPhase();

	if (phase === 'bootstrap') {
		return { eligible: false, reason: 'Manual appointment only during bootstrap phase' };
	}

	const minTrust = await getMinTrustForTopPercentage();

	if (user.trustScore < minTrust) {
		return { eligible: false, reason: `Trust score below top ${TOP_PERCENTAGE * 100}% threshold (${minTrust})` };
	}

	return { eligible: true };
}

/**
 * Manually appoint a moderator (bootstrap/early phase or override)
 */
export async function appointModerator(
	userId: string,
	appointedById?: string
): Promise<User> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new ModeratorError('User not found', 'USER_NOT_FOUND');
	}

	if (user.userType === 'MODERATOR') {
		throw new ModeratorError('User is already a moderator', 'ALREADY_MODERATOR');
	}

	if (user.userType === 'ORGANIZATION') {
		throw new ModeratorError('Organizations cannot become moderators', 'ORG_CANNOT_MODERATE');
	}

	// Check current moderator count
	const currentModCount = await db.user.count({
		where: { userType: 'MODERATOR' }
	});

	if (currentModCount >= MAX_MODERATORS) {
		throw new ModeratorError('Maximum moderator count reached', 'MAX_MODERATORS');
	}

	return db.user.update({
		where: { id: userId },
		data: { userType: 'MODERATOR' }
	});
}

/**
 * Demote a moderator back to their previous type
 */
export async function demoteModerator(userId: string): Promise<User> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new ModeratorError('User not found', 'USER_NOT_FOUND');
	}

	if (user.userType !== 'MODERATOR') {
		throw new ModeratorError('User is not a moderator', 'NOT_MODERATOR');
	}

	// Determine new type based on trust score
	// Default to VERIFIED unless they have expert verification
	let newType: 'VERIFIED' | 'EXPERT' | 'PHD' = 'VERIFIED';

	const verification = await db.expertVerification.findFirst({
		where: {
			userId,
			status: 'APPROVED'
		},
		orderBy: { createdAt: 'desc' }
	});

	if (verification) {
		newType = verification.type as 'EXPERT' | 'PHD';
	}

	return db.user.update({
		where: { id: userId },
		data: { userType: newType }
	});
}

/**
 * Get users eligible for auto-election
 */
export async function getEligibleCandidates(limit: number = 20): Promise<User[]> {
	const phase = await getElectionPhase();

	if (phase === 'bootstrap') {
		return [];
	}

	const minTrust = await getMinTrustForTopPercentage();

	return db.user.findMany({
		where: {
			userType: { notIn: ['MODERATOR', 'ORGANIZATION', 'ANONYMOUS'] },
			deletedAt: null,
			emailVerified: true,
			banLevel: 0,
			trustScore: { gte: minTrust }
		},
		orderBy: { trustScore: 'desc' },
		take: limit
	});
}

/**
 * Run auto-election process
 */
export async function runAutoElection(): Promise<{
	promoted: User[];
	demoted: User[];
}> {
	const phase = await getElectionPhase();

	if (phase === 'bootstrap') {
		return { promoted: [], demoted: [] };
	}

	const promoted: User[] = [];
	const demoted: User[] = [];

	// Check total trusted users
	const trustedCount = await db.user.count({
		where: {
			deletedAt: null,
			emailVerified: true,
			trustScore: { gte: 0 }
		}
	});

	if (trustedCount < MIN_TRUSTED_FOR_AUTO) {
		return { promoted: [], demoted: [] };
	}

	const minTrust = await getMinTrustForTopPercentage();

	// Get current moderators
	const currentMods = await db.user.findMany({
		where: { userType: 'MODERATOR' }
	});

	// Check for demotions (moderators who fell below threshold)
	for (const mod of currentMods) {
		if (mod.trustScore < minTrust) {
			const demotedUser = await demoteModerator(mod.id);
			demoted.push(demotedUser);
		}
	}

	// Get eligible candidates for promotion
	const candidates = await getEligibleCandidates(MAX_MODERATORS);

	const currentModCount = await db.user.count({
		where: { userType: 'MODERATOR' }
	});

	const slotsAvailable = MAX_MODERATORS - currentModCount;

	// Promote top candidates up to available slots
	for (let i = 0; i < Math.min(candidates.length, slotsAvailable); i++) {
		try {
			const promotedUser = await appointModerator(candidates[i].id);
			promoted.push(promotedUser);
		} catch {
			// Skip if any error
		}
	}

	return { promoted, demoted };
}

/**
 * Check if a moderator is inactive
 */
export function isModeratorInactive(user: User): boolean {
	if (user.userType !== 'MODERATOR') {
		return false;
	}

	if (!user.lastLoginAt) {
		// Never logged in, check creation date
		const daysSinceCreation = Math.floor(
			(Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
		);
		return daysSinceCreation > INACTIVE_DAYS;
	}

	const daysSinceLogin = Math.floor(
		(Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)
	);

	return daysSinceLogin > INACTIVE_DAYS;
}

/**
 * Get inactive moderators
 */
export async function getInactiveModerators(): Promise<User[]> {
	const inactiveDate = new Date();
	inactiveDate.setDate(inactiveDate.getDate() - INACTIVE_DAYS);

	return db.user.findMany({
		where: {
			userType: 'MODERATOR',
			OR: [
				{ lastLoginAt: { lt: inactiveDate } },
				{ lastLoginAt: null, createdAt: { lt: inactiveDate } }
			]
		},
		orderBy: { lastLoginAt: 'asc' }
	});
}

/**
 * Handle inactive moderators - demote and open slots
 */
export async function handleInactiveModerators(): Promise<{
	demoted: User[];
	promoted: User[];
}> {
	const inactiveMods = await getInactiveModerators();
	const demoted: User[] = [];
	const promoted: User[] = [];

	// Demote inactive moderators
	for (const mod of inactiveMods) {
		const demotedUser = await demoteModerator(mod.id);
		demoted.push(demotedUser);
	}

	// Promote candidates to fill slots if in mature phase
	const phase = await getElectionPhase();
	if (phase === 'mature' && demoted.length > 0) {
		const candidates = await getEligibleCandidates(demoted.length);

		for (const candidate of candidates) {
			try {
				const promotedUser = await appointModerator(candidate.id);
				promoted.push(promotedUser);
			} catch {
				// Skip errors
			}
		}
	}

	return { demoted, promoted };
}

/**
 * Handle a returning inactive moderator
 */
export async function handleReturningModerator(userId: string): Promise<{
	reinstated: boolean;
	message: string;
}> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new ModeratorError('User not found', 'USER_NOT_FOUND');
	}

	// Check if they're still in top 10%
	const eligibility = await isEligibleForModerator(userId);

	if (!eligibility.eligible && eligibility.reason !== 'Already a moderator') {
		return {
			reinstated: false,
			message: eligibility.reason || 'Not eligible for reinstatement'
		};
	}

	// Check if there's room
	const currentModCount = await db.user.count({
		where: { userType: 'MODERATOR' }
	});

	if (currentModCount >= MAX_MODERATORS) {
		// Need to demote lowest trusted moderator
		const lowestMod = await db.user.findFirst({
			where: { userType: 'MODERATOR' },
			orderBy: { trustScore: 'asc' }
		});

		if (lowestMod && lowestMod.trustScore < user.trustScore) {
			await demoteModerator(lowestMod.id);
			await appointModerator(userId);
			return {
				reinstated: true,
				message: 'Reinstated as moderator (displaced lower-trusted moderator)'
			};
		} else {
			return {
				reinstated: false,
				message: 'No available moderator slots'
			};
		}
	}

	// Promote directly
	await appointModerator(userId);
	return {
		reinstated: true,
		message: 'Reinstated as moderator'
	};
}

/**
 * Get all moderators
 */
export async function getAllModerators(): Promise<User[]> {
	return db.user.findMany({
		where: { userType: 'MODERATOR' },
		orderBy: { trustScore: 'desc' }
	});
}

/**
 * Get moderator statistics
 */
export async function getModeratorStats(): Promise<{
	total: number;
	active: number;
	inactive: number;
	phase: ElectionPhase;
	minTrustRequired: number;
	userCount: number;
}> {
	const phase = await getElectionPhase();
	const minTrust = await getMinTrustForTopPercentage();

	const [total, inactive, userCount] = await Promise.all([
		db.user.count({ where: { userType: 'MODERATOR' } }),
		getInactiveModerators().then((mods) => mods.length),
		db.user.count({ where: { deletedAt: null, emailVerified: true } })
	]);

	return {
		total,
		active: total - inactive,
		inactive,
		phase,
		minTrustRequired: minTrust,
		userCount
	};
}

/**
 * Get configuration values
 */
export function getModeratorConfig(): {
	bootstrapThreshold: number;
	earlyThreshold: number;
	minTrustedForAuto: number;
	topPercentage: number;
	inactiveDays: number;
	maxModerators: number;
} {
	return {
		bootstrapThreshold: BOOTSTRAP_THRESHOLD,
		earlyThreshold: EARLY_THRESHOLD,
		minTrustedForAuto: MIN_TRUSTED_FOR_AUTO,
		topPercentage: TOP_PERCENTAGE,
		inactiveDays: INACTIVE_DAYS,
		maxModerators: MAX_MODERATORS
	};
}
