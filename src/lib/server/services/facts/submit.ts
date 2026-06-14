import type { Fact, Role, SourceType } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { hitRateLimit } from '../rate-limit';
import { logAction } from '../moderation';
import { credibilityForType } from './source-type';

export type SubmitResult =
	| { ok: true; fact: Fact }
	| { ok: false; error: string; retryAfterSeconds?: number };

const urlSchema = z
	.string()
	.trim()
	.url('Enter a valid URL.')
	.refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'Only http(s) URLs.');

const SOURCE_TYPES: SourceType[] = [
	'PEER_REVIEWED',
	'OFFICIAL',
	'NEWS',
	'COMPANY',
	'BLOG',
	'OTHER'
];

export interface SubmitFactInput {
	userId: string;
	title: string;
	body: string;
	categoryId: string;
	source: { url: string; title: string; type: string };
}

export async function submitFact(deps: AuthDeps, input: SubmitFactInput): Promise<SubmitResult> {
	const author = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!author || author.deletedAt) return { ok: false, error: 'Account unavailable.' };
	// defense in depth: the route guard already requires a verified email,
	// but the service must not trust its callers (same as submitVeto/addComment)
	if (!author.emailVerifiedAt) {
		return { ok: false, error: 'Verify your email address first.' };
	}
	if (author.bannedUntil && author.bannedUntil > new Date()) {
		return { ok: false, error: 'Your account is banned and read-only.' };
	}

	const [titleMin, titleMax, bodyMax, maxPerDay, windowDays] = await Promise.all([
		getConfigNumber(deps, 'facts.title_min'),
		getConfigNumber(deps, 'facts.title_max'),
		getConfigNumber(deps, 'facts.body_max'),
		getConfigNumber(deps, 'facts.max_per_day'),
		getConfigNumber(deps, 'quorum.review_window_days')
	]);

	const title = input.title.trim();
	const body = input.body.trim();
	const sourceTitle = input.source.title.trim();
	if (title.length < titleMin || title.length > titleMax) {
		return { ok: false, error: `Title must be ${titleMin}-${titleMax} characters.` };
	}
	if (body.length === 0 || body.length > bodyMax) {
		return { ok: false, error: `Description must be 1-${bodyMax} characters.` };
	}
	const url = urlSchema.safeParse(input.source.url);
	if (!url.success) return { ok: false, error: url.error.issues[0].message };
	if (sourceTitle.length < 3 || sourceTitle.length > 200) {
		return { ok: false, error: 'Source title must be 3-200 characters.' };
	}
	if (!SOURCE_TYPES.includes(input.source.type as SourceType)) {
		return { ok: false, error: 'Invalid source type.' };
	}
	const type = input.source.type as SourceType;

	const category = await deps.prisma.category.findFirst({
		where: { id: input.categoryId, status: 'ACTIVE' }
	});
	if (!category) return { ok: false, error: 'Choose a valid category.' };

	const limit = await hitRateLimit(deps.redis, `fact-submit:${input.userId}`, maxPerDay, 86_400);
	if (!limit.allowed) {
		return {
			ok: false,
			error: 'Daily submission limit reached. Try again tomorrow.',
			retryAfterSeconds: limit.retryAfterSeconds
		};
	}

	const credibility = await credibilityForType(deps, type);
	const fact = await deps.prisma.fact.create({
		data: {
			title,
			body,
			authorId: input.userId,
			categoryId: category.id,
			reviewDeadline: new Date(Date.now() + windowDays * 86_400_000),
			sources: {
				create: {
					side: 'PRO',
					url: url.data,
					title: sourceTitle,
					type,
					credibility,
					addedById: input.userId
				}
			}
		}
	});
	return { ok: true, fact };
}

export type EditFactResult = { ok: true; fact: Fact } | { ok: false; error: string };

// Whether anyone other than the author has interacted with the fact yet: a
// foreign source, a foreign source vote, or a foreign comment. Used by the
// claim-immutability guard (R24) - once this is true the author can no longer
// edit the wording, so the claim that was reviewed cannot be swapped out.
export async function hasForeignInteraction(
	deps: AuthDeps,
	factId: string,
	authorId: string
): Promise<boolean> {
	const [foreignSource, foreignVote, foreignComment] = await Promise.all([
		deps.prisma.source.count({ where: { factId, addedById: { not: authorId } } }),
		deps.prisma.sourceVote.count({
			where: { source: { factId }, userId: { not: authorId } }
		}),
		deps.prisma.comment.count({ where: { factId, authorId: { not: authorId } } })
	]);
	return foreignSource > 0 || foreignVote > 0 || foreignComment > 0;
}

// Claim immutability (R24): the author may edit title/body only while the fact
// is UNDER_REVIEW and before the first foreign interaction. Moderators may edit
// at any time; their edits are logged as a ModerationAction.
export async function editFact(
	deps: AuthDeps,
	input: { factId: string; userId: string; role: Role; title: string; body: string }
): Promise<EditFactResult> {
	const fact = await deps.prisma.fact.findFirst({
		where: { id: input.factId, deletedAt: null }
	});
	if (!fact) return { ok: false, error: 'Fact not found.' };

	const isModerator = input.role === 'MODERATOR' || input.role === 'ADMIN';
	if (!isModerator) {
		if (fact.authorId !== input.userId) {
			return { ok: false, error: 'Only the author can edit this claim.' };
		}
		if (fact.status !== 'UNDER_REVIEW') {
			return { ok: false, error: 'The claim can only be edited while it is under review.' };
		}
		if (await hasForeignInteraction(deps, fact.id, fact.authorId)) {
			return {
				ok: false,
				error: 'Others have already weighed in - the claim wording is locked.'
			};
		}
	}

	const [titleMin, titleMax, bodyMax] = await Promise.all([
		getConfigNumber(deps, 'facts.title_min'),
		getConfigNumber(deps, 'facts.title_max'),
		getConfigNumber(deps, 'facts.body_max')
	]);
	const title = input.title.trim();
	const body = input.body.trim();
	if (title.length < titleMin || title.length > titleMax) {
		return { ok: false, error: `Title must be ${titleMin}-${titleMax} characters.` };
	}
	if (body.length === 0 || body.length > bodyMax) {
		return { ok: false, error: `Description must be 1-${bodyMax} characters.` };
	}

	const updated = await deps.prisma.fact.update({
		where: { id: fact.id },
		data: { title, body }
	});

	// a moderator editing someone else's claim is a moderation action (audited)
	if (isModerator && fact.authorId !== input.userId) {
		await logAction(deps, input.userId, 'edit_fact', 'FACT', fact.id, 'Edited claim title/body');
	}

	return { ok: true, fact: updated };
}
