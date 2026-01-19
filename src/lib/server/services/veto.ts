import { db } from '../db';
import type { Veto, VetoStatus, FactStatus, SourceType } from '@prisma/client';
import { calculateVoteWeight } from '$lib/utils/voteWeight';
import { updateUserTrustScore } from './trust';

// Configuration
const VETO_APPROVAL_THRESHOLD = parseInt(process.env.VETO_APPROVAL_THRESHOLD || '60');
const VETO_MIN_VOTES = parseInt(process.env.VETO_MIN_VOTES || '10');

export class VetoError extends Error {
	constructor(
		message: string,
		public code: string
	) {
		super(message);
		this.name = 'VetoError';
	}
}

interface CreateVetoInput {
	factId: string;
	reason: string;
	sources: Array<{
		url: string;
		title?: string;
		type?: SourceType;
	}>;
}

/**
 * Submit a veto against a fact
 */
export async function submitVeto(userId: string, input: CreateVetoInput): Promise<Veto> {
	// Validate fact exists and can be vetoed
	const fact = await db.fact.findUnique({
		where: { id: input.factId }
	});

	if (!fact) {
		throw new VetoError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Only PROVEN facts can be vetoed
	if (fact.status !== 'PROVEN') {
		throw new VetoError('Only proven facts can be vetoed', 'INVALID_STATUS');
	}

	// Check if user already has a pending veto on this fact
	const existingVeto = await db.veto.findFirst({
		where: {
			factId: input.factId,
			userId,
			status: 'PENDING'
		}
	});

	if (existingVeto) {
		throw new VetoError('You already have a pending veto on this fact', 'DUPLICATE_VETO');
	}

	// Validate at least one source
	if (!input.sources || input.sources.length === 0) {
		throw new VetoError('At least one source is required for a veto', 'SOURCE_REQUIRED');
	}

	// Validate source URLs
	for (const source of input.sources) {
		try {
			new URL(source.url);
		} catch {
			throw new VetoError(`Invalid source URL: ${source.url}`, 'INVALID_SOURCE_URL');
		}
	}

	// Create veto with sources in a transaction
	const veto = await db.$transaction(async (tx) => {
		// Create veto
		const newVeto = await tx.veto.create({
			data: {
				factId: input.factId,
				userId,
				reason: input.reason,
				status: 'PENDING'
			}
		});

		// Create sources
		for (const source of input.sources) {
			await tx.vetoSource.create({
				data: {
					vetoId: newVeto.id,
					url: source.url,
					title: source.title || null,
					type: source.type || 'OTHER'
				}
			});
		}

		// Update fact status to UNDER_VETO_REVIEW
		await tx.fact.update({
			where: { id: input.factId },
			data: { status: 'UNDER_VETO_REVIEW' }
		});

		return newVeto;
	});

	return veto;
}

/**
 * Vote on a veto
 */
export async function voteOnVeto(
	userId: string,
	vetoId: string,
	value: 1 | -1
): Promise<{
	vote: { value: number; weight: number };
	vetoStatus: VetoStatus;
	resolved: boolean;
}> {
	// Get user for vote weight
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new VetoError('User not found', 'USER_NOT_FOUND');
	}

	// Get veto
	const veto = await db.veto.findUnique({
		where: { id: vetoId }
	});

	if (!veto) {
		throw new VetoError('Veto not found', 'VETO_NOT_FOUND');
	}

	if (veto.status !== 'PENDING') {
		throw new VetoError('Veto has already been resolved', 'VETO_RESOLVED');
	}

	// Calculate vote weight
	const weight = calculateVoteWeight(user.userType, user.trustScore);

	// Upsert vote
	await db.vetoVote.upsert({
		where: { vetoId_userId: { vetoId, userId } },
		create: {
			vetoId,
			userId,
			value,
			weight
		},
		update: {
			value,
			weight
		}
	});

	// Check if veto should be resolved
	const { status, resolved } = await checkVetoResolution(vetoId);

	return {
		vote: { value, weight },
		vetoStatus: status,
		resolved
	};
}

/**
 * Check if veto should be resolved and resolve if necessary
 */
async function checkVetoResolution(vetoId: string): Promise<{
	status: VetoStatus;
	resolved: boolean;
}> {
	const veto = await db.veto.findUnique({
		where: { id: vetoId },
		include: { votes: true, fact: true }
	});

	if (!veto || veto.status !== 'PENDING') {
		return { status: veto?.status || 'PENDING', resolved: false };
	}

	// Calculate totals
	let weightedApprove = 0;
	let weightedReject = 0;

	for (const vote of veto.votes) {
		if (vote.value > 0) {
			weightedApprove += vote.weight;
		} else {
			weightedReject += vote.weight;
		}
	}

	const totalVotes = veto.votes.length;
	const totalWeight = weightedApprove + weightedReject;
	const approvalPercent = totalWeight > 0 ? (weightedApprove / totalWeight) * 100 : 50;

	// Check if minimum votes reached
	if (totalVotes < VETO_MIN_VOTES) {
		return { status: 'PENDING', resolved: false };
	}

	// Determine outcome
	if (approvalPercent >= VETO_APPROVAL_THRESHOLD) {
		// Veto approved - fact is wrong or outdated
		await resolveVeto(vetoId, 'APPROVED');
		return { status: 'APPROVED', resolved: true };
	} else if (approvalPercent <= 100 - VETO_APPROVAL_THRESHOLD) {
		// Veto rejected
		await resolveVeto(vetoId, 'REJECTED');
		return { status: 'REJECTED', resolved: true };
	}

	return { status: 'PENDING', resolved: false };
}

/**
 * Resolve a veto (approve or reject)
 */
async function resolveVeto(vetoId: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
	const veto = await db.veto.findUnique({
		where: { id: vetoId },
		include: { fact: { include: { user: true } } }
	});

	if (!veto) return;

	await db.$transaction(async (tx) => {
		// Update veto status
		await tx.veto.update({
			where: { id: vetoId },
			data: { status, resolvedAt: new Date() }
		});

		if (status === 'APPROVED') {
			// Veto succeeded - update fact status
			await tx.fact.update({
				where: { id: veto.factId },
				data: { status: 'DISPROVEN' }
			});

			// Update trust scores
			// Original fact author loses trust
			await updateUserTrustScore(veto.fact.userId, 'FACT_WRONG');

			// Veto submitter gains trust
			await updateUserTrustScore(veto.userId, 'VETO_SUCCESS');
		} else {
			// Veto rejected - restore fact status
			await tx.fact.update({
				where: { id: veto.factId },
				data: { status: 'PROVEN' }
			});

			// Veto submitter loses trust
			await updateUserTrustScore(veto.userId, 'VETO_FAIL');
		}
	});
}

/**
 * Get veto by ID with all details
 */
export async function getVetoById(vetoId: string) {
	return db.veto.findUnique({
		where: { id: vetoId },
		include: {
			sources: true,
			votes: true,
			fact: {
				select: { id: true, title: true, status: true }
			},
			user: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			}
		}
	});
}

/**
 * Get vetos for a fact
 */
export async function getFactVetos(factId: string) {
	return db.veto.findMany({
		where: { factId },
		include: {
			sources: true,
			user: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			_count: {
				select: { votes: true }
			}
		},
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get voting summary for a veto
 */
export async function getVetoVotingSummary(vetoId: string) {
	const votes = await db.vetoVote.findMany({
		where: { vetoId }
	});

	let weightedApprove = 0;
	let weightedReject = 0;
	let approveCount = 0;
	let rejectCount = 0;

	for (const vote of votes) {
		if (vote.value > 0) {
			weightedApprove += vote.weight;
			approveCount++;
		} else {
			weightedReject += vote.weight;
			rejectCount++;
		}
	}

	const totalWeight = weightedApprove + weightedReject;

	return {
		totalVotes: votes.length,
		approveCount,
		rejectCount,
		weightedApprove,
		weightedReject,
		approvalPercent: totalWeight > 0 ? (weightedApprove / totalWeight) * 100 : 50,
		minVotesRequired: VETO_MIN_VOTES,
		votesRemaining: Math.max(0, VETO_MIN_VOTES - votes.length)
	};
}

/**
 * Get user's vote on a veto
 */
export async function getUserVetoVote(userId: string, vetoId: string) {
	return db.vetoVote.findUnique({
		where: { vetoId_userId: { vetoId, userId } }
	});
}

/**
 * Get pending vetos for moderation
 */
export async function getPendingVetos(options: { limit?: number; offset?: number } = {}) {
	const limit = options.limit || 20;
	const offset = options.offset || 0;

	const [vetos, total] = await Promise.all([
		db.veto.findMany({
			where: { status: 'PENDING' },
			include: {
				fact: { select: { id: true, title: true } },
				user: { select: { id: true, firstName: true, lastName: true } },
				_count: { select: { votes: true } }
			},
			orderBy: { createdAt: 'asc' },
			take: limit,
			skip: offset
		}),
		db.veto.count({ where: { status: 'PENDING' } })
	]);

	return { vetos, total };
}
