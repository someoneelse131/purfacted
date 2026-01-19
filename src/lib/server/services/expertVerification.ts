/**
 * R31-R32: Expert Verification Service
 *
 * Handles diploma upload, review process, and user type upgrades.
 */

import { db } from '../db';
import type { ExpertVerification, VerificationReview, User } from '@prisma/client';
import { updateUserTrustScore } from './trust';

// Configurable values (could be moved to DB)
const REQUIRED_APPROVALS = parseInt(process.env.VERIFICATION_REQUIRED_APPROVALS || '3', 10);

export class VerificationError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'VerificationError';
		this.code = code;
	}
}

export interface CreateVerificationInput {
	type: 'EXPERT' | 'PHD';
	documentUrl: string;
	field: string;
}

export interface VerificationWithDetails extends ExpertVerification {
	user: Pick<User, 'id' | 'firstName' | 'lastName' | 'userType'>;
	reviews: (VerificationReview & {
		reviewer: Pick<User, 'id' | 'firstName' | 'lastName'>;
	})[];
}

/**
 * Submit a new expert verification request
 */
export async function submitVerification(
	userId: string,
	input: CreateVerificationInput
): Promise<ExpertVerification> {
	// Check if user exists
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new VerificationError('User not found', 'USER_NOT_FOUND');
	}

	// Check if user already has this verification type
	if (user.userType === input.type) {
		throw new VerificationError(
			`You already have ${input.type} verification`,
			'ALREADY_VERIFIED'
		);
	}

	// Check for pending verification of same type
	const existingPending = await db.expertVerification.findFirst({
		where: {
			userId,
			type: input.type,
			status: 'PENDING'
		}
	});

	if (existingPending) {
		throw new VerificationError(
			'You already have a pending verification request',
			'PENDING_EXISTS'
		);
	}

	// Validate document URL
	if (!input.documentUrl || input.documentUrl.trim().length === 0) {
		throw new VerificationError('Document URL is required', 'INVALID_DOCUMENT');
	}

	// Validate field
	if (!input.field || input.field.trim().length === 0) {
		throw new VerificationError('Field of expertise is required', 'INVALID_FIELD');
	}

	if (input.field.length > 200) {
		throw new VerificationError('Field name too long (max 200 chars)', 'FIELD_TOO_LONG');
	}

	const verification = await db.expertVerification.create({
		data: {
			userId,
			type: input.type,
			documentUrl: input.documentUrl,
			field: input.field.trim(),
			status: 'PENDING'
		}
	});

	return verification;
}

/**
 * Get a verification by ID with details
 */
export async function getVerificationById(id: string): Promise<VerificationWithDetails | null> {
	const verification = await db.expertVerification.findUnique({
		where: { id },
		include: {
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					userType: true
				}
			},
			reviews: {
				include: {
					reviewer: {
						select: {
							id: true,
							firstName: true,
							lastName: true
						}
					}
				},
				orderBy: { createdAt: 'asc' }
			}
		}
	});

	return verification;
}

/**
 * Get pending verifications for review
 */
export async function getPendingVerifications(
	limit: number = 20,
	offset: number = 0
): Promise<VerificationWithDetails[]> {
	const verifications = await db.expertVerification.findMany({
		where: { status: 'PENDING' },
		include: {
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					userType: true
				}
			},
			reviews: {
				include: {
					reviewer: {
						select: {
							id: true,
							firstName: true,
							lastName: true
						}
					}
				}
			}
		},
		orderBy: { createdAt: 'asc' },
		take: limit,
		skip: offset
	});

	return verifications;
}

/**
 * Get user's verifications
 */
export async function getUserVerifications(userId: string): Promise<ExpertVerification[]> {
	return db.expertVerification.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Submit a review for a verification
 */
export async function reviewVerification(
	verificationId: string,
	reviewerId: string,
	approved: boolean,
	comment?: string
): Promise<VerificationReview> {
	const verification = await db.expertVerification.findUnique({
		where: { id: verificationId },
		include: {
			reviews: true,
			user: true
		}
	});

	if (!verification) {
		throw new VerificationError('Verification not found', 'VERIFICATION_NOT_FOUND');
	}

	if (verification.status !== 'PENDING') {
		throw new VerificationError(
			'Verification is no longer pending',
			'VERIFICATION_NOT_PENDING'
		);
	}

	// Prevent self-review
	if (verification.userId === reviewerId) {
		throw new VerificationError('Cannot review your own verification', 'SELF_REVIEW');
	}

	// Check if reviewer already reviewed
	const existingReview = await db.verificationReview.findFirst({
		where: {
			verificationId,
			reviewerId
		}
	});

	if (existingReview) {
		throw new VerificationError('You already reviewed this verification', 'ALREADY_REVIEWED');
	}

	// Create the review
	const review = await db.verificationReview.create({
		data: {
			verificationId,
			reviewerId,
			approved,
			comment: comment?.trim() || null
		}
	});

	// Check if we have enough approvals
	const allReviews = [...verification.reviews, review];
	const approvalCount = allReviews.filter((r) => r.approved).length;
	const rejectionCount = allReviews.filter((r) => !r.approved).length;

	// If we have enough approvals, approve the verification
	if (approvalCount >= REQUIRED_APPROVALS) {
		await approveVerification(verification, allReviews.filter((r) => r.approved));
	}
	// If we have too many rejections (more than half potential reviews), reject
	else if (rejectionCount > REQUIRED_APPROVALS) {
		await rejectVerification(verification);
	}

	return review;
}

/**
 * Approve a verification (internal)
 */
async function approveVerification(
	verification: ExpertVerification & { user: User },
	approvalReviews: VerificationReview[]
): Promise<void> {
	// Update verification status
	await db.expertVerification.update({
		where: { id: verification.id },
		data: { status: 'APPROVED' }
	});

	// Update user type
	await db.user.update({
		where: { id: verification.userId },
		data: { userType: verification.type }
	});

	// Award trust points to reviewers (+3 each via VERIFICATION_CORRECT action)
	for (const review of approvalReviews) {
		await updateUserTrustScore(review.reviewerId, 'VERIFICATION_CORRECT');
	}
}

/**
 * Reject a verification (internal)
 */
async function rejectVerification(verification: ExpertVerification): Promise<void> {
	// Update verification status
	await db.expertVerification.update({
		where: { id: verification.id },
		data: { status: 'REJECTED' }
	});

	// Deduct trust from submitter (-10 via VERIFICATION_WRONG action)
	await updateUserTrustScore(verification.userId, 'VERIFICATION_WRONG');
}

/**
 * Moderator override - approve or reject immediately
 */
export async function moderatorOverride(
	verificationId: string,
	moderatorId: string,
	approved: boolean,
	comment?: string
): Promise<ExpertVerification> {
	// Verify moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new VerificationError('Only moderators can override', 'NOT_MODERATOR');
	}

	const verification = await db.expertVerification.findUnique({
		where: { id: verificationId },
		include: { user: true, reviews: true }
	});

	if (!verification) {
		throw new VerificationError('Verification not found', 'VERIFICATION_NOT_FOUND');
	}

	if (verification.status !== 'PENDING') {
		throw new VerificationError(
			'Verification is no longer pending',
			'VERIFICATION_NOT_PENDING'
		);
	}

	// Record the moderator review
	await db.verificationReview.create({
		data: {
			verificationId,
			reviewerId: moderatorId,
			approved,
			comment: comment ? `[MODERATOR OVERRIDE] ${comment.trim()}` : '[MODERATOR OVERRIDE]'
		}
	});

	if (approved) {
		await approveVerification(verification, []);
	} else {
		await rejectVerification(verification);
	}

	return db.expertVerification.findUnique({
		where: { id: verificationId }
	}) as Promise<ExpertVerification>;
}

/**
 * Get verification statistics
 */
export async function getVerificationStats(): Promise<{
	pending: number;
	approved: number;
	rejected: number;
	total: number;
}> {
	const [pending, approved, rejected] = await Promise.all([
		db.expertVerification.count({ where: { status: 'PENDING' } }),
		db.expertVerification.count({ where: { status: 'APPROVED' } }),
		db.expertVerification.count({ where: { status: 'REJECTED' } })
	]);

	return {
		pending,
		approved,
		rejected,
		total: pending + approved + rejected
	};
}

/**
 * Get verifiers for a user (for profile display)
 */
export async function getVerifiers(
	userId: string
): Promise<{ type: string; verifiers: { firstName: string; lastName: string }[] }[]> {
	const approvedVerifications = await db.expertVerification.findMany({
		where: {
			userId,
			status: 'APPROVED'
		},
		include: {
			reviews: {
				where: { approved: true },
				include: {
					reviewer: {
						select: {
							firstName: true,
							lastName: true
						}
					}
				}
			}
		}
	});

	return approvedVerifications.map((v) => ({
		type: v.type,
		verifiers: v.reviews.map((r) => ({
			firstName: r.reviewer.firstName,
			lastName: r.reviewer.lastName
		}))
	}));
}
