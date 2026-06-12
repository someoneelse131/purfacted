import type { Side, Source, SourceType } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { getVoteWeight, type VotingUser } from '../vote-weight';
import { credibilityForType } from './source-type';
import { reopenReview } from './status-engine';

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

function normalizeUrl(url: string): string {
	// trailing-slash and case differences should not bypass duplicate detection
	try {
		const parsed = new URL(url);
		parsed.hash = '';
		const path = parsed.pathname.replace(/\/+$/, '');
		return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
	} catch {
		return url;
	}
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
	const fact = await deps.prisma.fact.findUnique({ where: { id: input.factId } });
	if (!fact) return { ok: false, error: 'Fact not found.' };
	// UNSUBSTANTIATED facts are revived by new evidence - exactly once (R13)
	const revives = fact.status === 'UNSUBSTANTIATED' && fact.revivedAt === null;
	if (fact.status !== 'UNDER_REVIEW' && !revives) {
		return { ok: false, error: 'Evidence can only be added while the fact is under review.' };
	}
	if (input.side !== 'PRO' && input.side !== 'CONTRA') {
		return { ok: false, error: 'Invalid side.' };
	}
	const url = urlSchema.safeParse(input.url);
	if (!url.success) return { ok: false, error: url.error.issues[0].message };
	const title = input.title.trim();
	if (title.length < 3 || title.length > 200) {
		return { ok: false, error: 'Source title must be 3-200 characters.' };
	}
	if (!SOURCE_TYPES.includes(input.type as SourceType)) {
		return { ok: false, error: 'Invalid source type.' };
	}

	const normalized = normalizeUrl(url.data);
	const existingSources = await deps.prisma.source.findMany({
		where: { factId: fact.id, status: 'ACTIVE' },
		select: { id: true, url: true, title: true }
	});
	const duplicate = existingSources.find((s) => normalizeUrl(s.url) === normalized);
	if (duplicate) {
		return {
			ok: false,
			error: `This URL is already on the fact ("${duplicate.title}"). Vote on it instead.`
		};
	}

	const type = input.type as SourceType;
	const source = await deps.prisma.source.create({
		data: {
			factId: fact.id,
			side: input.side as Side,
			url: url.data,
			title,
			type,
			credibility: await credibilityForType(deps, type),
			addedById: input.userId
		}
	});

	if (revives) {
		await reopenReview(deps, fact.id);
		await deps.prisma.fact.update({
			where: { id: fact.id },
			data: { revivedAt: new Date() }
		});
	}
	return { ok: true, data: source };
}

export async function voteOnSource(
	deps: AuthDeps,
	input: { sourceId: string; user: VotingUser; value: number }
): Promise<EvidenceResult<{ weight: number }>> {
	if (input.value !== 1 && input.value !== -1) {
		return { ok: false, error: 'Vote must be up or down.' };
	}
	const source = await deps.prisma.source.findUnique({
		where: { id: input.sourceId },
		include: { fact: { select: { id: true, status: true, authorId: true, categoryId: true } } }
	});
	if (!source || source.status !== 'ACTIVE') return { ok: false, error: 'Source not found.' };
	if (source.fact.status !== 'UNDER_REVIEW') {
		return { ok: false, error: 'Voting is only open while the fact is under review.' };
	}
	if (source.fact.authorId === input.user.id) {
		return { ok: false, error: 'You cannot vote on sources of your own fact.' };
	}

	const weight = await getVoteWeight(deps, input.user, source.fact.categoryId);
	if (weight <= 0) {
		return { ok: false, error: 'Your account cannot vote (verify your email first).' };
	}

	await deps.prisma.sourceVote.upsert({
		where: { sourceId_userId: { sourceId: source.id, userId: input.user.id } },
		create: { sourceId: source.id, userId: input.user.id, value: input.value, weight },
		// changing your vote re-snapshots the weight
		update: { value: input.value, weight }
	});
	return { ok: true, data: { weight } };
}

export async function flagSource(
	deps: AuthDeps,
	input: { sourceId: string; userId: string; reason: string }
): Promise<EvidenceResult<null>> {
	const source = await deps.prisma.source.findUnique({ where: { id: input.sourceId } });
	if (!source || source.status !== 'ACTIVE') return { ok: false, error: 'Source not found.' };
	const reason = input.reason.trim();
	if (reason.length < 3) return { ok: false, error: 'Give a short reason.' };

	const existing = await deps.prisma.report.findFirst({
		where: {
			targetType: 'SOURCE',
			targetId: source.id,
			reporterId: input.userId,
			status: 'OPEN'
		}
	});
	if (existing) return { ok: false, error: 'You already flagged this source.' };

	await deps.prisma.report.create({
		data: {
			targetType: 'SOURCE',
			targetId: source.id,
			reporterId: input.userId,
			reason
		}
	});
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
	const penalty = await getConfigNumber(deps, 'rep.source_removed');
	await deps.prisma.$transaction([
		deps.prisma.source.update({ where: { id: source.id }, data: { status: 'REMOVED' } }),
		deps.prisma.user.update({
			where: { id: source.addedById },
			data: { reputation: { increment: penalty } }
		})
	]);
	return { ok: true, data: null };
}
