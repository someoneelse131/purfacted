import { db } from '../db';
import { sha256 } from '$lib/utils/crypto';

const RATE_LIMIT_VOTES_PER_DAY = parseInt(process.env.RATE_LIMIT_ANONYMOUS_VOTES_PER_DAY || '1', 10);
const ANONYMOUS_VOTE_WEIGHT = parseFloat(process.env.VOTE_WEIGHT_ANONYMOUS || '0.1');
const FEATURE_ANONYMOUS_VOTING = process.env.FEATURE_ANONYMOUS_VOTING !== 'false';

export interface AnonymousVoteServiceError {
	code: 'RATE_LIMITED' | 'ALREADY_VOTED' | 'INVALID_CAPTCHA' | 'FEATURE_DISABLED' | 'INVALID_VOTE';
	message: string;
}

export interface AnonymousVoteInput {
	ip: string;
	contentType: 'fact' | 'discussion' | 'comment';
	contentId: string;
	value: 1 | -1;
	captchaToken?: string;
}

export interface AnonymousVoteResult {
	success: boolean;
	voteId: string;
	weight: number;
	remainingVotesToday: number;
}

/**
 * Hash an IP address for privacy-preserving storage
 */
function hashIp(ip: string): string {
	// Add a salt for additional privacy
	const salt = process.env.IP_HASH_SALT || 'purfacted-ip-salt';
	return sha256(`${ip}:${salt}`);
}

/**
 * Verify captcha token (placeholder - implement with actual captcha service)
 */
async function verifyCaptcha(token: string): Promise<boolean> {
	// TODO: Implement actual captcha verification (R39)
	// For now, accept any non-empty token in development
	if (process.env.NODE_ENV === 'development') {
		return token.length > 0;
	}

	// In production, verify with reCAPTCHA or similar
	const CAPTCHA_SECRET_KEY = process.env.CAPTCHA_SECRET_KEY;
	if (!CAPTCHA_SECRET_KEY) {
		console.warn('Captcha secret key not configured');
		return true; // Allow if not configured
	}

	try {
		const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: `secret=${CAPTCHA_SECRET_KEY}&response=${token}`
		});

		const data = await response.json();
		return data.success === true;
	} catch (error) {
		console.error('Captcha verification failed:', error);
		return false;
	}
}

/**
 * Check and update IP rate limit
 */
async function checkIpRateLimit(ipHash: string): Promise<{ allowed: boolean; remaining: number }> {
	const now = new Date();
	const endOfDay = new Date(now);
	endOfDay.setHours(23, 59, 59, 999);

	// Find or create rate limit record
	let rateLimit = await db.ipRateLimit.findUnique({
		where: { ipHash }
	});

	if (!rateLimit) {
		// Create new record
		rateLimit = await db.ipRateLimit.create({
			data: {
				ipHash,
				voteCount: 0,
				resetAt: endOfDay
			}
		});
	}

	// Check if rate limit has reset
	if (rateLimit.resetAt < now) {
		// Reset the counter
		rateLimit = await db.ipRateLimit.update({
			where: { ipHash },
			data: {
				voteCount: 0,
				resetAt: endOfDay
			}
		});
	}

	const remaining = RATE_LIMIT_VOTES_PER_DAY - rateLimit.voteCount;

	return {
		allowed: remaining > 0,
		remaining: Math.max(0, remaining)
	};
}

/**
 * Increment IP vote count
 */
async function incrementIpVoteCount(ipHash: string): Promise<void> {
	await db.ipRateLimit.update({
		where: { ipHash },
		data: {
			voteCount: { increment: 1 }
		}
	});
}

/**
 * Submit an anonymous vote
 */
export async function submitAnonymousVote(input: AnonymousVoteInput): Promise<AnonymousVoteResult> {
	// Check if feature is enabled
	if (!FEATURE_ANONYMOUS_VOTING) {
		const error: AnonymousVoteServiceError = {
			code: 'FEATURE_DISABLED',
			message: 'Anonymous voting is currently disabled'
		};
		throw error;
	}

	// Validate vote value
	if (input.value !== 1 && input.value !== -1) {
		const error: AnonymousVoteServiceError = {
			code: 'INVALID_VOTE',
			message: 'Vote must be 1 (upvote) or -1 (downvote)'
		};
		throw error;
	}

	// Verify captcha
	if (input.captchaToken) {
		const captchaValid = await verifyCaptcha(input.captchaToken);
		if (!captchaValid) {
			const error: AnonymousVoteServiceError = {
				code: 'INVALID_CAPTCHA',
				message: 'Invalid captcha. Please try again.'
			};
			throw error;
		}
	}

	const ipHash = hashIp(input.ip);

	// Check rate limit
	const rateLimitResult = await checkIpRateLimit(ipHash);
	if (!rateLimitResult.allowed) {
		const error: AnonymousVoteServiceError = {
			code: 'RATE_LIMITED',
			message: 'You have reached the daily voting limit. Please try again tomorrow.'
		};
		throw error;
	}

	// Check if already voted on this content
	const existingVote = await db.anonymousVote.findUnique({
		where: {
			ipHash_contentType_contentId: {
				ipHash,
				contentType: input.contentType,
				contentId: input.contentId
			}
		}
	});

	if (existingVote) {
		const error: AnonymousVoteServiceError = {
			code: 'ALREADY_VOTED',
			message: 'You have already voted on this content'
		};
		throw error;
	}

	// Create the vote
	const vote = await db.anonymousVote.create({
		data: {
			ipHash,
			contentType: input.contentType,
			contentId: input.contentId,
			value: input.value,
			weight: ANONYMOUS_VOTE_WEIGHT,
			captchaToken: input.captchaToken
		}
	});

	// Increment rate limit counter
	await incrementIpVoteCount(ipHash);

	return {
		success: true,
		voteId: vote.id,
		weight: vote.weight,
		remainingVotesToday: rateLimitResult.remaining - 1
	};
}

/**
 * Get anonymous vote status for an IP on specific content
 */
export async function getAnonymousVoteStatus(
	ip: string,
	contentType: string,
	contentId: string
): Promise<{ hasVoted: boolean; vote: number | null; remainingToday: number }> {
	const ipHash = hashIp(ip);

	const existingVote = await db.anonymousVote.findUnique({
		where: {
			ipHash_contentType_contentId: {
				ipHash,
				contentType,
				contentId
			}
		}
	});

	const rateLimitResult = await checkIpRateLimit(ipHash);

	return {
		hasVoted: !!existingVote,
		vote: existingVote?.value ?? null,
		remainingToday: rateLimitResult.remaining
	};
}

/**
 * Get total anonymous votes for content
 */
export async function getAnonymousVotesForContent(
	contentType: string,
	contentId: string
): Promise<{ upvotes: number; downvotes: number; weightedScore: number }> {
	const votes = await db.anonymousVote.findMany({
		where: { contentType, contentId }
	});

	let upvotes = 0;
	let downvotes = 0;
	let weightedScore = 0;

	for (const vote of votes) {
		if (vote.value > 0) {
			upvotes++;
		} else {
			downvotes++;
		}
		weightedScore += vote.value * vote.weight;
	}

	return { upvotes, downvotes, weightedScore };
}

/**
 * Remove an anonymous vote (admin function)
 */
export async function removeAnonymousVote(voteId: string): Promise<void> {
	await db.anonymousVote.delete({
		where: { id: voteId }
	});
}

/**
 * Clear rate limits (admin/testing function)
 */
export async function clearAllRateLimits(): Promise<void> {
	await db.ipRateLimit.deleteMany({});
}
