import type { FactStatus, Veto } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { hitRateLimit } from '../rate-limit';
import { addSource, validateSourceInput } from './evidence';
import { reopenReview } from './review-window';
import { awardReputation } from '../reputation';
import { evaluateBadges } from '../badges';
import { emitActivity } from '../activity';
import { createNotification } from '../notifications';
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
		source: { side: string; url: string; title: string; type: string; quote: string };
	}
): Promise<VetoResult> {
	if (input.user.deletedAt) {
		return { ok: false, error: 'Account unavailable.' };
	}
	if (!input.user.emailVerifiedAt) {
		return { ok: false, error: 'Verify your email address first.' };
	}
	if (input.user.bannedUntil && input.user.bannedUntil > new Date()) {
		return { ok: false, error: 'Your account is banned.' };
	}

	const reasonMin = await getConfigNumber(deps, 'veto.reason_min_length');
	const reason = input.reason.trim();
	if (reason.length < reasonMin) {
		return { ok: false, error: `Explain the veto in at least ${reasonMin} characters.` };
	}

	const fact = await deps.prisma.fact.findUnique({ where: { id: input.factId } });
	if (!fact || fact.deletedAt) return { ok: false, error: 'Fact not found.' };
	if (!DECIDED.includes(fact.status)) {
		return { ok: false, error: 'Only decided facts can be vetoed.' };
	}

	const openVeto = await deps.prisma.veto.findFirst({
		where: { factId: fact.id, status: 'OPEN' }
	});
	if (openVeto) return { ok: false, error: 'This fact already has an open veto.' };

	// validate the required NEW source BEFORE any state change - the
	// normalized-duplicate check enforces "NEW" (R16)
	const validated = await validateSourceInput(deps, fact.id, input.source);
	if (!validated.ok) return { ok: false, error: validated.error };

	// rate limit only after everything validated, so rejected attempts do not
	// consume the daily budget
	const maxPerDay = await getConfigNumber(deps, 'veto.max_per_day');
	const limit = await hitRateLimit(deps.redis, `veto:${input.user.id}`, maxPerDay, 86_400);
	if (!limit.allowed) {
		return { ok: false, error: 'Veto limit reached. Try again tomorrow.' };
	}

	// guarded reopen: only succeeds while the fact still has the decided
	// status we validated against, so concurrent vetoes/decisions cannot race
	const previousStatus = fact.status;
	const reopened = await reopenReview(deps, fact.id, { from: [previousStatus] });
	if (!reopened) {
		return { ok: false, error: 'The fact changed in the meantime. Reload and try again.' };
	}

	const restoreDecidedState = async () => {
		await deps.prisma.fact.update({
			where: { id: fact.id },
			data: {
				status: previousStatus,
				decidedAt: fact.decidedAt,
				reviewStartedAt: fact.reviewStartedAt,
				reviewDeadline: fact.reviewDeadline
			}
		});
	};

	const source = await addSource(deps, {
		factId: fact.id,
		userId: input.user.id,
		side: input.source.side,
		url: input.source.url,
		title: input.source.title,
		type: input.source.type,
		quote: input.source.quote
	});
	if (!source.ok) {
		// pre-validated, so only a concurrent duplicate can land here
		await restoreDecidedState();
		return { ok: false, error: source.error };
	}

	try {
		const veto = await deps.prisma.veto.create({
			data: {
				factId: fact.id,
				submitterId: input.user.id,
				reason,
				previousStatus
			}
		});

		await emitActivity(deps, {
			type: 'veto_opened',
			actorId: input.user.id,
			subjectType: 'VETO',
			subjectId: veto.id,
			factId: fact.id,
			categoryId: fact.categoryId,
			payload: { previousStatus }
		});

		// notify the fact's author that their claim was contested (R32)
		await createNotification(deps, {
			userId: fact.authorId,
			type: 'veto_received',
			actorId: input.user.id,
			factId: fact.id,
			subjectId: veto.id,
			payload: { previousStatus }
		});

		return { ok: true, veto };
	} catch (err) {
		// partial unique index vetoes_one_open_per_fact: one OPEN veto per fact
		if (isUniqueViolation(err)) {
			await restoreDecidedState();
			return { ok: false, error: 'This fact already has an open veto.' };
		}
		throw err;
	}
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === 'object' &&
		err !== null &&
		'code' in err &&
		(err as { code?: string }).code === 'P2002'
	);
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

	const fact = await deps.prisma.fact.findUnique({
		where: { id: factId },
		select: { categoryId: true }
	});

	for (const veto of openVetoes) {
		const succeeded = veto.previousStatus !== null && veto.previousStatus !== newStatus;
		// claim the resolution: only the caller that flips OPEN -> resolved may
		// ledger the reputation, so concurrent resolvers cannot double-award
		const claimed = await deps.prisma.veto.updateMany({
			where: { id: veto.id, status: 'OPEN' },
			data: { status: succeeded ? 'SUCCEEDED' : 'FAILED', resolvedAt: new Date() }
		});
		if (claimed.count === 0) continue;
		// reputation via the engine (R21), subject = veto id
		await awardReputation(deps, {
			userId: veto.submitterId,
			action: succeeded ? 'veto_succeeded' : 'veto_failed',
			subjectId: veto.id
		});
		// system-driven event: the re-decision resolved the veto, not the actor
		await emitActivity(deps, {
			type: 'veto_resolved',
			subjectType: 'VETO',
			subjectId: veto.id,
			factId,
			categoryId: fact?.categoryId ?? null,
			payload: { outcome: succeeded ? 'SUCCEEDED' : 'FAILED', newStatus }
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
