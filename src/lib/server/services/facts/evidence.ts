import type { Side, Source, SourceType } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { getVoteContext, type VotingUser } from '../vote-weight';
import { credibilityForType } from './source-type';
import { reopenReview } from './review-window';
import { awardReputation } from '../reputation';
import { evaluateBadges } from '../badges';
import { submitReport } from '../moderation';

// Evidence system (R11): PRO/CONTRA sources on facts under review,
// weighted per-source voting with weight snapshots, spam flagging.

export type EvidenceResult<T> = { ok: true; data: T } | { ok: false; error: string };

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

export function normalizeUrl(url: string): string {
	// scheme/host/port/slash/fragment variants must not bypass duplicate
	// detection: http==https, www. stripped, default ports dropped,
	// hash removed, trailing slashes trimmed
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
		const port = parsed.port === '80' || parsed.port === '443' ? '' : parsed.port;
		const path = parsed.pathname.replace(/\/+$/, '');
		return `https://${host}${port ? `:${port}` : ''}${path}${parsed.search}`;
	} catch {
		return url;
	}
}

interface ValidatedSourceInput {
	side: Side;
	url: string;
	title: string;
	type: SourceType;
}

// Shared validation for new evidence (addSource + the veto's required NEW
// source): side, URL, title bounds (config), type whitelist and the
// normalized-duplicate check. REMOVED sources count as duplicates too, so
// moderated junk cannot be instantly re-added.
export async function validateSourceInput(
	deps: AuthDeps,
	factId: string,
	input: { side: string; url: string; title: string; type: string }
): Promise<EvidenceResult<ValidatedSourceInput>> {
	if (input.side !== 'PRO' && input.side !== 'CONTRA') {
		return { ok: false, error: 'Invalid side.' };
	}
	const url = urlSchema.safeParse(input.url);
	if (!url.success) return { ok: false, error: url.error.issues[0].message };
	const [titleMin, titleMax] = await Promise.all([
		getConfigNumber(deps, 'sources.title_min'),
		getConfigNumber(deps, 'sources.title_max')
	]);
	const title = input.title.trim();
	if (title.length < titleMin || title.length > titleMax) {
		return { ok: false, error: `Source title must be ${titleMin}-${titleMax} characters.` };
	}
	if (!SOURCE_TYPES.includes(input.type as SourceType)) {
		return { ok: false, error: 'Invalid source type.' };
	}

	const normalized = normalizeUrl(url.data);
	const existingSources = await deps.prisma.source.findMany({
		where: { factId },
		select: { id: true, url: true, title: true, status: true }
	});
	const duplicate = existingSources.find((s) => normalizeUrl(s.url) === normalized);
	if (duplicate) {
		if (duplicate.status === 'REMOVED') {
			return {
				ok: false,
				error: 'This URL was removed from the fact by moderation and cannot be re-added.'
			};
		}
		return {
			ok: false,
			error: `This URL is already on the fact ("${duplicate.title}"). Vote on it instead.`
		};
	}

	return {
		ok: true,
		data: { side: input.side as Side, url: url.data, title, type: input.type as SourceType }
	};
}

// Service-level caller gate (defense in depth - the route guard is not the
// only line): same rules as submitVeto/addComment.
async function callerBlocked(deps: AuthDeps, userId: string): Promise<string | null> {
	const user = await deps.prisma.user.findUnique({
		where: { id: userId },
		select: { emailVerifiedAt: true, bannedUntil: true, deletedAt: true }
	});
	if (!user || user.deletedAt) return 'Account unavailable.';
	if (!user.emailVerifiedAt) return 'Verify your email address first.';
	if (user.bannedUntil && user.bannedUntil > new Date()) return 'Your account is banned.';
	return null;
}

export async function addSource(
	deps: AuthDeps,
	input: {
		factId: string;
		userId: string;
		side: string;
		url: string;
		title: string;
		type: string;
	}
): Promise<EvidenceResult<Source>> {
	const blocked = await callerBlocked(deps, input.userId);
	if (blocked) return { ok: false, error: blocked };

	const fact = await deps.prisma.fact.findUnique({ where: { id: input.factId } });
	if (!fact || fact.deletedAt) return { ok: false, error: 'Fact not found.' };
	// UNSUBSTANTIATED facts are revived by new evidence - exactly once (R13)
	const revives = fact.status === 'UNSUBSTANTIATED' && fact.revivedAt === null;
	if (fact.status !== 'UNDER_REVIEW' && !revives) {
		return { ok: false, error: 'Evidence can only be added while the fact is under review.' };
	}

	const validated = await validateSourceInput(deps, fact.id, input);
	if (!validated.ok) return validated;

	if (revives) {
		// atomic revive-once claim: the guarded reopen consumes revivedAt, so
		// concurrent revivers cannot both win (R13)
		const claimed = await reopenReview(deps, fact.id, {
			from: ['UNSUBSTANTIATED'],
			where: { revivedAt: null },
			data: { revivedAt: new Date() }
		});
		if (!claimed) {
			return { ok: false, error: 'Evidence can only be added while the fact is under review.' };
		}
	}

	const source = await deps.prisma.source.create({
		data: {
			factId: fact.id,
			side: validated.data.side,
			url: validated.data.url,
			title: validated.data.title,
			type: validated.data.type,
			credibility: await credibilityForType(deps, validated.data.type),
			addedById: input.userId
		}
	});
	return { ok: true, data: source };
}

export async function voteOnSource(
	deps: AuthDeps,
	input: { sourceId: string; user: VotingUser; value: number }
): Promise<EvidenceResult<{ weight: number; factId: string }>> {
	if (input.value !== 1 && input.value !== -1) {
		return { ok: false, error: 'Vote must be up or down.' };
	}
	// service-level caller gate (defense in depth, same rules as addComment)
	if (input.user.deletedAt) return { ok: false, error: 'Account unavailable.' };
	if (!input.user.emailVerifiedAt) {
		return { ok: false, error: 'Verify your email address first.' };
	}
	if (input.user.bannedUntil && input.user.bannedUntil > new Date()) {
		return { ok: false, error: 'Your account is banned.' };
	}

	const source = await deps.prisma.source.findUnique({
		where: { id: input.sourceId },
		include: {
			fact: {
				select: { id: true, status: true, authorId: true, categoryId: true, deletedAt: true }
			}
		}
	});
	if (!source || source.status !== 'ACTIVE') return { ok: false, error: 'Source not found.' };
	if (source.fact.deletedAt) return { ok: false, error: 'Fact not found.' };
	if (source.fact.status !== 'UNDER_REVIEW') {
		return { ok: false, error: 'Voting is only open while the fact is under review.' };
	}
	if (source.fact.authorId === input.user.id) {
		return { ok: false, error: 'You cannot vote on sources of your own fact.' };
	}

	const { weight, onProbation } = await getVoteContext(deps, input.user, source.fact.categoryId);
	if (weight <= 0) {
		return { ok: false, error: 'Your account cannot vote (verify your email first).' };
	}

	await deps.prisma.sourceVote.upsert({
		where: { sourceId_userId: { sourceId: source.id, userId: input.user.id } },
		create: {
			sourceId: source.id,
			userId: input.user.id,
			value: input.value,
			weight,
			onProbation
		},
		// changing your vote re-snapshots the weight and probation flag
		update: { value: input.value, weight, onProbation }
	});
	// first vote may earn "First Verdict"; streak progress (R22)
	await evaluateBadges(deps, input.user.id);
	return { ok: true, data: { weight, factId: source.fact.id } };
}

export async function flagSource(
	deps: AuthDeps,
	input: { sourceId: string; userId: string; reason: string }
): Promise<EvidenceResult<null>> {
	const detail = input.reason.trim();
	if (detail.length < 3) return { ok: false, error: 'Give a short reason.' };

	// flags are reports: routing through submitReport applies the whitelist,
	// the per-day report limit and the open-report dedup (R17)
	const result = await submitReport(deps, {
		targetType: 'SOURCE',
		targetId: input.sourceId,
		reporterId: input.userId,
		reason: 'misinformation',
		detail
	});
	if (!result.ok) return { ok: false, error: result.error };
	return { ok: true, data: null };
}

// Moderation outcome for a flagged source (queue UI lands in R17):
// removing it costs the adder reputation (Part A: -3, config rep.source_removed).
export async function removeSourceAsMisleading(
	deps: AuthDeps,
	input: { sourceId: string }
): Promise<EvidenceResult<null>> {
	const source = await deps.prisma.source.findUnique({ where: { id: input.sourceId } });
	if (!source || source.status !== 'ACTIVE') return { ok: false, error: 'Source not found.' };
	await deps.prisma.source.update({ where: { id: source.id }, data: { status: 'REMOVED' } });
	// penalty via the reputation engine (R21), subject = source id
	await awardReputation(deps, {
		userId: source.addedById,
		action: 'source_removed',
		subjectId: source.id
	});
	return { ok: true, data: null };
}
