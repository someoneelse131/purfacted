import { db } from '../db';
import type { OrganizationTag, OfficialComment } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface OrgTagWithDetails extends OrganizationTag {
	orgUser: {
		id: string;
		firstName: string;
		lastName: string;
		userType: string;
	};
	taggedBy?: {
		id: string;
		firstName: string;
		lastName: string;
	} | null;
}

export interface OfficialCommentWithDetails extends OfficialComment {
	orgUser: {
		id: string;
		firstName: string;
		lastName: string;
	};
}

// ============================================
// Error Handling
// ============================================

export class OrgCommentError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'OrgCommentError';
		this.code = code;
	}
}

// ============================================
// Organization Tagging
// ============================================

/**
 * Tag an organization in a fact
 */
export async function tagOrganization(
	factId: string,
	orgUserId: string,
	taggedById?: string
): Promise<OrganizationTag> {
	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new OrgCommentError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Verify org user exists and is an organization
	const orgUser = await db.user.findUnique({
		where: { id: orgUserId },
		select: { userType: true }
	});

	if (!orgUser) {
		throw new OrgCommentError('Organization not found', 'ORG_NOT_FOUND');
	}

	if (orgUser.userType !== 'ORGANIZATION') {
		throw new OrgCommentError('User is not an organization', 'NOT_ORGANIZATION');
	}

	// Check if already tagged
	const existing = await db.organizationTag.findUnique({
		where: {
			factId_orgUserId: {
				factId,
				orgUserId
			}
		}
	});

	if (existing) {
		throw new OrgCommentError('Organization is already tagged', 'ALREADY_TAGGED');
	}

	return db.organizationTag.create({
		data: {
			factId,
			orgUserId,
			taggedById: taggedById || null
		}
	});
}

/**
 * Get organizations tagged in a fact
 */
export async function getFactOrganizations(factId: string): Promise<OrgTagWithDetails[]> {
	return db.organizationTag.findMany({
		where: { factId },
		include: {
			orgUser: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			taggedBy: {
				select: { id: true, firstName: true, lastName: true }
			}
		}
	});
}

/**
 * Dispute a fact as an organization
 */
export async function disputeFact(orgUserId: string, factId: string): Promise<OrganizationTag> {
	// Verify user is an organization
	const user = await db.user.findUnique({
		where: { id: orgUserId },
		select: { userType: true }
	});

	if (!user || user.userType !== 'ORGANIZATION') {
		throw new OrgCommentError('Only organizations can dispute facts', 'NOT_ORGANIZATION');
	}

	// Find or create the org tag
	let orgTag = await db.organizationTag.findUnique({
		where: {
			factId_orgUserId: {
				factId,
				orgUserId
			}
		}
	});

	if (!orgTag) {
		// Auto-tag the organization when disputing
		orgTag = await db.organizationTag.create({
			data: {
				factId,
				orgUserId,
				isDisputed: true
			}
		});
	} else {
		// Update existing tag to disputed
		orgTag = await db.organizationTag.update({
			where: { id: orgTag.id },
			data: { isDisputed: true }
		});
	}

	// Change fact status to IN_REVIEW
	await db.fact.update({
		where: { id: factId },
		data: { status: 'IN_REVIEW' }
	});

	return orgTag;
}

// ============================================
// Official Comments
// ============================================

/**
 * Post an official comment as an organization
 */
export async function postOfficialComment(
	orgUserId: string,
	factId: string,
	body: string
): Promise<OfficialComment> {
	// Verify user is an organization
	const user = await db.user.findUnique({
		where: { id: orgUserId },
		select: { userType: true }
	});

	if (!user || user.userType !== 'ORGANIZATION') {
		throw new OrgCommentError('Only organizations can post official comments', 'NOT_ORGANIZATION');
	}

	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new OrgCommentError('Fact not found', 'FACT_NOT_FOUND');
	}

	if (!body || body.trim().length === 0) {
		throw new OrgCommentError('Comment body is required', 'BODY_REQUIRED');
	}

	if (body.length > 5000) {
		throw new OrgCommentError('Comment must be 5000 characters or less', 'BODY_TOO_LONG');
	}

	// Check for existing official comment
	const existing = await db.officialComment.findFirst({
		where: { factId, orgUserId }
	});

	if (existing) {
		// Update existing comment
		return db.officialComment.update({
			where: { id: existing.id },
			data: { body: body.trim() }
		});
	}

	// Ensure org is tagged
	const orgTag = await db.organizationTag.findUnique({
		where: {
			factId_orgUserId: {
				factId,
				orgUserId
			}
		}
	});

	if (!orgTag) {
		// Auto-tag when posting official comment
		await db.organizationTag.create({
			data: {
				factId,
				orgUserId
			}
		});
	}

	return db.officialComment.create({
		data: {
			factId,
			orgUserId,
			body: body.trim()
		}
	});
}

/**
 * Get official comments for a fact
 */
export async function getFactOfficialComments(factId: string): Promise<OfficialCommentWithDetails[]> {
	return db.officialComment.findMany({
		where: { factId },
		include: {
			orgUser: {
				select: { id: true, firstName: true, lastName: true }
			}
		},
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Delete an official comment
 */
export async function deleteOfficialComment(
	orgUserId: string,
	commentId: string
): Promise<void> {
	const comment = await db.officialComment.findUnique({
		where: { id: commentId }
	});

	if (!comment) {
		throw new OrgCommentError('Comment not found', 'COMMENT_NOT_FOUND');
	}

	if (comment.orgUserId !== orgUserId) {
		throw new OrgCommentError('You can only delete your own comments', 'NOT_OWNER');
	}

	await db.officialComment.delete({
		where: { id: commentId }
	});
}

/**
 * Add source to a fact as an organization
 */
export async function addOrgSource(
	orgUserId: string,
	factId: string,
	url: string,
	title?: string
): Promise<void> {
	// Verify user is an organization
	const user = await db.user.findUnique({
		where: { id: orgUserId },
		select: { userType: true }
	});

	if (!user || user.userType !== 'ORGANIZATION') {
		throw new OrgCommentError('Only organizations can add sources', 'NOT_ORGANIZATION');
	}

	// Verify fact exists
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new OrgCommentError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Add source with OFFICIAL type (organizations are official sources)
	await db.source.create({
		data: {
			factId,
			url,
			title: title || null,
			type: 'OFFICIAL',
			credibility: 80, // Official org sources are high credibility
			addedById: orgUserId
		}
	});
}
