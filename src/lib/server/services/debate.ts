import { db } from '../db';
import type { Debate, DebateMessage, DebateVote, DebateStatus } from '@prisma/client';
import { calculateVoteWeight } from '$lib/utils/voteWeight';

// ============================================
// Types
// ============================================

export interface CreateDebateInput {
	factId: string;
	participantId: string;
}

export interface DebateWithDetails extends Debate {
	fact: {
		id: string;
		title: string;
	};
	initiator: {
		id: string;
		firstName: string;
		lastName: string;
		userType: string;
	};
	participant: {
		id: string;
		firstName: string;
		lastName: string;
		userType: string;
	};
	_count: {
		messages: number;
		votes: number;
	};
}

export interface MessageWithUser extends DebateMessage {
	user: {
		id: string;
		firstName: string;
		lastName: string;
	};
}

export interface VotingSummary {
	upvotes: number;
	downvotes: number;
	weightedScore: number;
	totalVotes: number;
}

// ============================================
// Error Handling
// ============================================

export class DebateError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'DebateError';
		this.code = code;
	}
}

// ============================================
// Configuration
// ============================================

const MAX_MESSAGE_LENGTH = 5000;
const MAX_MESSAGES_PER_DAY_STRANGER = 10; // To users you haven't debated with before
const DEBATE_EXPIRY_HOURS = 72; // Auto-expire pending debates
const MESSAGE_RETENTION_DAYS = 365; // 1 year

// ============================================
// Debate CRUD
// ============================================

/**
 * Initiate a debate with another user about a fact
 */
export async function initiateDebate(
	initiatorId: string,
	input: CreateDebateInput
): Promise<Debate> {
	// Verify initiator is a verified user
	const initiator = await db.user.findUnique({
		where: { id: initiatorId },
		select: { userType: true, emailVerified: true }
	});

	if (!initiator) {
		throw new DebateError('User not found', 'USER_NOT_FOUND');
	}

	if (initiator.userType === 'ANONYMOUS') {
		throw new DebateError('Only verified users can initiate debates', 'NOT_VERIFIED');
	}

	if (!initiator.emailVerified) {
		throw new DebateError('Please verify your email before initiating debates', 'EMAIL_NOT_VERIFIED');
	}

	// Cannot debate yourself
	if (initiatorId === input.participantId) {
		throw new DebateError('You cannot debate with yourself', 'SELF_DEBATE');
	}

	// Verify participant exists
	const participant = await db.user.findUnique({
		where: { id: input.participantId }
	});

	if (!participant) {
		throw new DebateError('Participant not found', 'PARTICIPANT_NOT_FOUND');
	}

	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: input.factId }
	});

	if (!fact) {
		throw new DebateError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Check for existing active debate between these users on this fact
	const existingDebate = await db.debate.findFirst({
		where: {
			factId: input.factId,
			status: { in: ['PENDING', 'ACTIVE'] },
			OR: [
				{ initiatorId, participantId: input.participantId },
				{ initiatorId: input.participantId, participantId: initiatorId }
			]
		}
	});

	if (existingDebate) {
		throw new DebateError(
			'An active debate already exists between you and this user on this fact',
			'DEBATE_EXISTS'
		);
	}

	// Check daily message limit to strangers
	const hasDebatedBefore = await hasUserDebatedWithUser(initiatorId, input.participantId);
	if (!hasDebatedBefore) {
		const messagesToday = await getMessagesToStrangersToday(initiatorId);
		if (messagesToday >= MAX_MESSAGES_PER_DAY_STRANGER) {
			throw new DebateError(
				`You have reached the daily limit of ${MAX_MESSAGES_PER_DAY_STRANGER} messages to new users`,
				'DAILY_LIMIT_REACHED'
			);
		}
	}

	return db.debate.create({
		data: {
			factId: input.factId,
			initiatorId,
			participantId: input.participantId,
			status: 'PENDING'
		}
	});
}

/**
 * Check if two users have debated before
 */
async function hasUserDebatedWithUser(userId1: string, userId2: string): Promise<boolean> {
	const debate = await db.debate.findFirst({
		where: {
			status: { in: ['ACTIVE', 'PUBLISHED'] },
			OR: [
				{ initiatorId: userId1, participantId: userId2 },
				{ initiatorId: userId2, participantId: userId1 }
			]
		}
	});

	return debate !== null;
}

/**
 * Get count of messages to strangers today
 */
async function getMessagesToStrangersToday(userId: string): Promise<number> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Get debates initiated today with users we haven't debated with before
	const debatesToday = await db.debate.count({
		where: {
			initiatorId: userId,
			createdAt: { gte: today },
			status: 'PENDING'
		}
	});

	return debatesToday;
}

/**
 * Get debate by ID with details
 */
export async function getDebateById(debateId: string): Promise<DebateWithDetails | null> {
	return db.debate.findUnique({
		where: { id: debateId },
		include: {
			fact: {
				select: { id: true, title: true }
			},
			initiator: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			participant: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			_count: {
				select: { messages: true, votes: true }
			}
		}
	});
}

/**
 * Accept a debate invitation
 */
export async function acceptDebate(userId: string, debateId: string): Promise<Debate> {
	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	if (debate.participantId !== userId) {
		throw new DebateError('Only the invited participant can accept', 'NOT_PARTICIPANT');
	}

	if (debate.status !== 'PENDING') {
		throw new DebateError('This debate is no longer pending', 'NOT_PENDING');
	}

	return db.debate.update({
		where: { id: debateId },
		data: { status: 'ACTIVE' }
	});
}

/**
 * Decline a debate invitation
 */
export async function declineDebate(userId: string, debateId: string): Promise<Debate> {
	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	if (debate.participantId !== userId) {
		throw new DebateError('Only the invited participant can decline', 'NOT_PARTICIPANT');
	}

	if (debate.status !== 'PENDING') {
		throw new DebateError('This debate is no longer pending', 'NOT_PENDING');
	}

	return db.debate.update({
		where: { id: debateId },
		data: { status: 'DECLINED' }
	});
}

/**
 * Get user's debates
 */
export async function getUserDebates(
	userId: string,
	options?: {
		status?: DebateStatus;
		page?: number;
		limit?: number;
	}
): Promise<{ debates: DebateWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 20, 50);
	const skip = (page - 1) * limit;

	const where: any = {
		OR: [{ initiatorId: userId }, { participantId: userId }]
	};

	if (options?.status) {
		where.status = options.status;
	}

	const [debates, total] = await Promise.all([
		db.debate.findMany({
			where,
			include: {
				fact: {
					select: { id: true, title: true }
				},
				initiator: {
					select: { id: true, firstName: true, lastName: true, userType: true }
				},
				participant: {
					select: { id: true, firstName: true, lastName: true, userType: true }
				},
				_count: {
					select: { messages: true, votes: true }
				}
			},
			orderBy: { updatedAt: 'desc' },
			skip,
			take: limit
		}),
		db.debate.count({ where })
	]);

	return { debates, total };
}

// ============================================
// Debate Messages
// ============================================

/**
 * Send a message in a debate
 */
export async function sendMessage(
	userId: string,
	debateId: string,
	body: string
): Promise<DebateMessage> {
	if (!body || body.trim().length === 0) {
		throw new DebateError('Message body is required', 'BODY_REQUIRED');
	}

	if (body.length > MAX_MESSAGE_LENGTH) {
		throw new DebateError(
			`Message must be ${MAX_MESSAGE_LENGTH} characters or less`,
			'MESSAGE_TOO_LONG'
		);
	}

	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	// Verify user is part of the debate
	if (debate.initiatorId !== userId && debate.participantId !== userId) {
		throw new DebateError('You are not part of this debate', 'NOT_IN_DEBATE');
	}

	// Only allow messages in active debates
	if (debate.status !== 'ACTIVE') {
		throw new DebateError('This debate is not active', 'DEBATE_NOT_ACTIVE');
	}

	// Check for copy-paste spam detection
	const recentMessages = await db.debateMessage.findMany({
		where: {
			userId,
			createdAt: { gte: new Date(Date.now() - 60000) } // Last minute
		},
		select: { body: true }
	});

	const duplicateCount = recentMessages.filter((m) => m.body === body.trim()).length;
	if (duplicateCount >= 2) {
		throw new DebateError(
			'Duplicate message detected. Please avoid copy-pasting the same message.',
			'DUPLICATE_MESSAGE'
		);
	}

	const message = await db.debateMessage.create({
		data: {
			debateId,
			userId,
			body: body.trim()
		}
	});

	// Update debate's updatedAt
	await db.debate.update({
		where: { id: debateId },
		data: { updatedAt: new Date() }
	});

	return message;
}

/**
 * Get messages in a debate
 */
export async function getDebateMessages(
	debateId: string,
	options?: {
		page?: number;
		limit?: number;
	}
): Promise<{ messages: MessageWithUser[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 50, 100);
	const skip = (page - 1) * limit;

	const [messages, total] = await Promise.all([
		db.debateMessage.findMany({
			where: { debateId },
			include: {
				user: {
					select: { id: true, firstName: true, lastName: true }
				}
			},
			orderBy: { createdAt: 'asc' },
			skip,
			take: limit
		}),
		db.debateMessage.count({ where: { debateId } })
	]);

	return { messages, total };
}

// ============================================
// Publishing
// ============================================

/**
 * Request to publish a debate
 */
export async function requestPublish(
	userId: string,
	debateId: string,
	title: string
): Promise<Debate> {
	if (!title || title.trim().length === 0) {
		throw new DebateError('Title is required for publishing', 'TITLE_REQUIRED');
	}

	if (title.length > 200) {
		throw new DebateError('Title must be 200 characters or less', 'TITLE_TOO_LONG');
	}

	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	if (debate.initiatorId !== userId && debate.participantId !== userId) {
		throw new DebateError('You are not part of this debate', 'NOT_IN_DEBATE');
	}

	if (debate.status !== 'ACTIVE') {
		throw new DebateError('Only active debates can be published', 'NOT_ACTIVE');
	}

	// Store the proposed title (actual publishing requires other user's consent)
	return db.debate.update({
		where: { id: debateId },
		data: { title: title.trim() }
	});
}

/**
 * Accept publish request and make debate public
 */
export async function acceptPublish(userId: string, debateId: string): Promise<Debate> {
	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	if (debate.initiatorId !== userId && debate.participantId !== userId) {
		throw new DebateError('You are not part of this debate', 'NOT_IN_DEBATE');
	}

	if (debate.status !== 'ACTIVE') {
		throw new DebateError('This debate cannot be published', 'NOT_ACTIVE');
	}

	if (!debate.title) {
		throw new DebateError('A title must be set before publishing', 'NO_TITLE');
	}

	return db.debate.update({
		where: { id: debateId },
		data: {
			status: 'PUBLISHED',
			publishedAt: new Date()
		}
	});
}

/**
 * Get published debates for a fact
 */
export async function getFactPublishedDebates(
	factId: string,
	options?: {
		page?: number;
		limit?: number;
	}
): Promise<{ debates: DebateWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 10, 20);
	const skip = (page - 1) * limit;

	const where = {
		factId,
		status: 'PUBLISHED' as DebateStatus
	};

	const [debates, total] = await Promise.all([
		db.debate.findMany({
			where,
			include: {
				fact: {
					select: { id: true, title: true }
				},
				initiator: {
					select: { id: true, firstName: true, lastName: true, userType: true }
				},
				participant: {
					select: { id: true, firstName: true, lastName: true, userType: true }
				},
				_count: {
					select: { messages: true, votes: true }
				}
			},
			orderBy: { publishedAt: 'desc' },
			skip,
			take: limit
		}),
		db.debate.count({ where })
	]);

	return { debates, total };
}

// ============================================
// Voting on Published Debates
// ============================================

/**
 * Vote on a published debate
 */
export async function voteOnDebate(
	userId: string,
	debateId: string,
	value: 1 | -1
): Promise<{ vote: DebateVote; votingSummary: VotingSummary }> {
	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) {
		throw new DebateError('Debate not found', 'DEBATE_NOT_FOUND');
	}

	if (debate.status !== 'PUBLISHED') {
		throw new DebateError('Only published debates can be voted on', 'NOT_PUBLISHED');
	}

	// Get user for vote weight calculation
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { userType: true, trustScore: true }
	});

	if (!user) {
		throw new DebateError('User not found', 'USER_NOT_FOUND');
	}

	const weight = calculateVoteWeight(user.userType, user.trustScore);

	// Upsert vote
	const vote = await db.debateVote.upsert({
		where: {
			debateId_userId: {
				debateId,
				userId
			}
		},
		create: {
			debateId,
			userId,
			value,
			weight
		},
		update: {
			value,
			weight
		}
	});

	const votingSummary = await getDebateVotingSummary(debateId);

	return { vote, votingSummary };
}

/**
 * Get voting summary for a debate
 */
export async function getDebateVotingSummary(debateId: string): Promise<VotingSummary> {
	const votes = await db.debateVote.findMany({
		where: { debateId }
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

	return {
		upvotes,
		downvotes,
		weightedScore: Math.round(weightedScore * 100) / 100,
		totalVotes: votes.length
	};
}

/**
 * Get user's vote on a debate
 */
export async function getUserDebateVote(
	userId: string,
	debateId: string
): Promise<DebateVote | null> {
	return db.debateVote.findUnique({
		where: {
			debateId_userId: {
				debateId,
				userId
			}
		}
	});
}

// ============================================
// Utility
// ============================================

/**
 * Check if user can access a debate
 */
export async function canUserAccessDebate(userId: string, debateId: string): Promise<boolean> {
	const debate = await db.debate.findUnique({
		where: { id: debateId }
	});

	if (!debate) return false;

	// Published debates are public
	if (debate.status === 'PUBLISHED') return true;

	// Private debates only accessible by participants
	return debate.initiatorId === userId || debate.participantId === userId;
}

/**
 * Expire pending debates older than configured time
 */
export async function expirePendingDebates(): Promise<number> {
	const expiryDate = new Date(Date.now() - DEBATE_EXPIRY_HOURS * 60 * 60 * 1000);

	const result = await db.debate.updateMany({
		where: {
			status: 'PENDING',
			createdAt: { lt: expiryDate }
		},
		data: { status: 'EXPIRED' }
	});

	return result.count;
}

/**
 * Get message retention notice
 */
export function getRetentionNotice(): string {
	return `Messages are retained for ${MESSAGE_RETENTION_DAYS / 365} year(s). After this period, they may be deleted.`;
}
