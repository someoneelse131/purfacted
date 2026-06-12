import type { FactStatus, Veto } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { hitRateLimit } from '../rate-limit';
import { addSource } from './evidence';
import { reopenReview } from './review-window';
import { awardReputation } from '../reputation';
import { evaluateBadges } from '../badges';
import type { VotingUser } from '../vote-weight';

// Veto system (R16): formal objection against a decided fact. Requires at
// least one NEW source; sends the fact back to UNDER_REVIEW. After the
// re-decision the submitter gains/loses reputation depending on whether the
// status changed.

export type VetoResult = { ok: true; veto: Veto } | { ok: false; error: string };

const DECIDED: FactStatus[] = ['VERIFIED', 'DISPUTED', 'REFUTED'];

export async function submitVeto(
	deps: AuthDeps,
	input: {
		factId: string;
		user: VotingUser;
		reason: string;
		source: { side: string; url: string; title: string; type: string };
	}
): Promise<VetoResult> {
	if (!input.user.emailVerifiedAt) {
		return { ok: false, error: 'Verify your email address first.' };
	}
	if (input.user.bannedUntil && input.user.bannedUntil > new Date()) {
		return { ok: false, error: 'Your account is banned.' };
	}

	const reason = input.reason.trim();
	if (reason.length < 10) {
		return { ok: false, error: 'Explain the veto in at least 10 characters.' };
	}

	const fact = await deps.prisma.fact.findUnique({ where: { id: input.factId } });
	if (!fact) return { ok: false, error: 'Fact not found.' };
	if (!DECIDED.includes(fact.status)) {
		return { ok: false, error: 'Only decided facts can be vetoed.' };
	}

	const openVeto = await deps.prisma.veto.findFirst({
		where: { factId: fact.id, status: 'OPEN' }
	});
	if (openVeto) return { ok: false, error: 'This fact already has an open veto.' };

	const maxPerDay = await getConfigNumber(deps, 'veto.max_per_day');
	const limit = await hitRateLimit(deps.redis, `veto:${input.user.id}`, maxPerDay, 86_400);
	if (!limit.allowed) {
		return { ok: false, error: 'Veto limit reached. Try again tomorrow.' };
	}

	// re-open first so the new source passes the under-review gate; the
	// duplicate-URL check inside addSource enforces "NEW source"
	const previousStatus = fact.status;
	await reopenReview(deps, fact.id);
	const source = await addSource(deps, {
		factId: fact.id,
		userId: input.user.id,
		side: input.source.side,
		url: input.source.url,
		title: input.source.title,
		type: input.source.type
	});
	if (!source.ok) {
		// restore the decided state - the veto did not happen
		await deps.prisma.fact.update({
			where: { id: fact.id },
			data: {
				status: previousStatus,
				decidedAt: fact.decidedAt,
				reviewStartedAt: fact.reviewStartedAt,
				reviewDeadline: fact.reviewDeadline
			}
		});
		return { ok: false, error: source.error };
	}

	const veto = await deps.prisma.veto.create({
		data: {
			factId: fact.id,
			submitterId: input.user.id,
			reason,
			previousStatus
		}
	});
	return { ok: true, veto };
}

// Called by the status engine when a fact gets (re-)decided or expires.
// Succeeded = the new status differs from the status at veto time.
export async function resolveVetoes(
	deps: AuthDeps,
	factId: string,
	newStatus: FactStatus
): Promise<void> {
	const openVetoes = await deps.prisma.veto.findMany({
		where: { factId, status: 'OPEN' }
	});
	if (openVetoes.length === 0) return;

	for (const veto of openVetoes) {
		const succeeded = veto.previousStatus !== null && veto.previousStatus !== newStatus;
		await deps.prisma.veto.update({
			where: { id: veto.id },
			data: { status: succeeded ? 'SUCCEEDED' : 'FAILED', resolvedAt: new Date() }
		});
		// reputation via the engine (R21), subject = veto id
		await awardReputation(deps, {
			userId: veto.submitterId,
			action: succeeded ? 'veto_succeeded' : 'veto_failed',
			subjectId: veto.id
		});
		// a successful veto may earn "Veto Verified" (R22)
		if (succeeded) await evaluateBadges(deps, veto.submitterId);
	}
}

export async function getOpenVeto(deps: AuthDeps, factId: string) {
	return deps.prisma.veto.findFirst({
		where: { factId, status: 'OPEN' },
		include: { submitter: { select: { username: true } } }
	});
}
