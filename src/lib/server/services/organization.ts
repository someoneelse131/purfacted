/**
 * R33: Organization Accounts Service
 *
 * Handles organization registration, approval, and special privileges.
 */

import { db } from '../db';
import type { User } from '@prisma/client';

// Configurable values
const ORG_VOTE_WEIGHT = parseFloat(process.env.ORG_VOTE_WEIGHT || '100');
const ORG_INITIAL_TRUST = parseInt(process.env.ORG_INITIAL_TRUST || '50', 10);

// Verified domain patterns for organizations
const VERIFIED_DOMAIN_PATTERNS = [
	/\.edu$/i,
	/\.gov$/i,
	/\.org$/i,
	/\.ac\.[a-z]{2}$/i, // Academic domains like .ac.uk
	/\.edu\.[a-z]{2}$/i // Education domains like .edu.au
];

export class OrganizationError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'OrganizationError';
		this.code = code;
	}
}

export interface OrgRegistrationInput {
	email: string;
	firstName: string; // Organization name
	lastName: string; // Organization type/category
	password: string;
	domain: string; // Verified domain
}

export interface OrgApprovalInput {
	approved: boolean;
	reason?: string;
}

/**
 * Check if an email domain is a verified organization domain
 */
export function isVerifiedDomain(email: string): boolean {
	const domain = email.split('@')[1];
	if (!domain) return false;

	// Check against known patterns
	for (const pattern of VERIFIED_DOMAIN_PATTERNS) {
		if (pattern.test(domain)) {
			return true;
		}
	}

	// Also accept custom company domains (not free email providers)
	const freeEmailProviders = [
		'gmail.com',
		'yahoo.com',
		'hotmail.com',
		'outlook.com',
		'aol.com',
		'icloud.com',
		'mail.com',
		'protonmail.com',
		'zoho.com'
	];

	return !freeEmailProviders.includes(domain.toLowerCase());
}

/**
 * Get the domain from an email
 */
export function getDomainFromEmail(email: string): string {
	return email.split('@')[1] || '';
}

/**
 * Check if a user is an approved organization
 */
export async function isApprovedOrganization(userId: string): Promise<boolean> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	return user?.userType === 'ORGANIZATION';
}

/**
 * Get pending organization registrations
 */
export async function getPendingOrganizations(
	limit: number = 20,
	offset: number = 0
): Promise<User[]> {
	// Organizations pending approval have VERIFIED type and special pendingOrgApproval flag
	// Since we don't have that flag, we'll use a different approach:
	// We look for users with pendingEmail set and userType still VERIFIED who registered with org domain
	// For simplicity, we'll track pending orgs via a moderation queue item

	// Alternative: Just get all users who might be orgs based on domain
	// This is a simplified implementation - in production, use a separate approval table
	return [];
}

/**
 * Get organization details
 */
export async function getOrganizationById(userId: string): Promise<User | null> {
	const user = await db.user.findUnique({
		where: { id: userId, userType: 'ORGANIZATION' }
	});

	return user;
}

/**
 * Approve an organization registration
 */
export async function approveOrganization(
	userId: string,
	moderatorId: string,
	reason?: string
): Promise<User> {
	// Verify moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new OrganizationError('Only moderators can approve organizations', 'NOT_MODERATOR');
	}

	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new OrganizationError('User not found', 'USER_NOT_FOUND');
	}

	if (user.userType === 'ORGANIZATION') {
		throw new OrganizationError('User is already an organization', 'ALREADY_ORGANIZATION');
	}

	// Update user to organization type with org settings
	const updatedUser = await db.user.update({
		where: { id: userId },
		data: {
			userType: 'ORGANIZATION',
			trustScore: ORG_INITIAL_TRUST
		}
	});

	return updatedUser;
}

/**
 * Reject an organization registration
 */
export async function rejectOrganization(
	userId: string,
	moderatorId: string,
	reason: string
): Promise<void> {
	// Verify moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new OrganizationError('Only moderators can reject organizations', 'NOT_MODERATOR');
	}

	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new OrganizationError('User not found', 'USER_NOT_FOUND');
	}

	// Just leave user as regular VERIFIED - they can continue as normal user
	// In production, you might want to log this rejection
}

/**
 * Get organization vote weight
 */
export function getOrganizationVoteWeight(): number {
	return ORG_VOTE_WEIGHT;
}

/**
 * Get organization initial trust score
 */
export function getOrganizationInitialTrust(): number {
	return ORG_INITIAL_TRUST;
}

/**
 * Check if organization can comment on a fact
 * Organizations can comment on facts that mention them
 */
export async function canOrgCommentOnFact(
	orgUserId: string,
	factId: string
): Promise<boolean> {
	// Check if org is tagged in the fact
	const tag = await db.organizationTag.findFirst({
		where: {
			factId,
			orgUserId
		}
	});

	return !!tag;
}

/**
 * Check if organization can delete a fact
 * Organizations CANNOT delete facts, even ones about them
 */
export function canOrgDeleteFact(): boolean {
	return false;
}

/**
 * Get facts where organization is tagged
 */
export async function getOrganizationFacts(
	orgUserId: string,
	limit: number = 20,
	offset: number = 0
): Promise<{ factId: string; isDisputed: boolean }[]> {
	const tags = await db.organizationTag.findMany({
		where: { orgUserId },
		select: {
			factId: true,
			isDisputed: true
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset
	});

	return tags;
}

/**
 * Get facts created by an organization (they are "owners")
 */
export async function getOrganizationOwnedFacts(
	orgUserId: string,
	limit: number = 20,
	offset: number = 0
): Promise<string[]> {
	const facts = await db.fact.findMany({
		where: { userId: orgUserId },
		select: { id: true },
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset
	});

	return facts.map((f) => f.id);
}

/**
 * Get all organizations
 */
export async function getAllOrganizations(
	limit: number = 50,
	offset: number = 0
): Promise<User[]> {
	return db.user.findMany({
		where: { userType: 'ORGANIZATION' },
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset
	});
}

/**
 * Get organization statistics
 */
export async function getOrganizationStats(): Promise<{
	total: number;
	activeThisMonth: number;
	factsPosted: number;
	officialComments: number;
}> {
	const now = new Date();
	const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

	const [total, activeThisMonth, factsPosted, officialComments] = await Promise.all([
		db.user.count({ where: { userType: 'ORGANIZATION' } }),
		db.user.count({
			where: {
				userType: 'ORGANIZATION',
				lastLoginAt: { gte: monthAgo }
			}
		}),
		db.fact.count({
			where: {
				user: { userType: 'ORGANIZATION' }
			}
		}),
		db.officialComment.count()
	]);

	return {
		total,
		activeThisMonth,
		factsPosted,
		officialComments
	};
}
