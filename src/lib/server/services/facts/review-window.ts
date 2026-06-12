import type { FactStatus, Prisma } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';

// Puts a fact back to UNDER_REVIEW with a fresh window (R13 revive, R16 veto).
// The update is a guarded claim: it only succeeds when the fact is still in
// one of the expected source statuses (and not soft-deleted), so concurrent
// reopen/decide flows cannot both win. Callers must check the return value.
export async function reopenReview(
	deps: AuthDeps,
	factId: string,
	options: {
		// statuses the fact must currently have for the claim to succeed
		from: FactStatus[];
		// extra conditions merged into the guard (e.g. revive-once: revivedAt null)
		where?: Prisma.FactWhereInput;
		// extra fields written together with the reopen (e.g. revivedAt)
		data?: Prisma.FactUpdateManyMutationInput;
	}
): Promise<boolean> {
	const windowDays = await getConfigNumber(deps, 'quorum.review_window_days');
	const updated = await deps.prisma.fact.updateMany({
		where: {
			id: factId,
			status: { in: options.from },
			deletedAt: null,
			...options.where
		},
		data: {
			status: 'UNDER_REVIEW',
			reviewStartedAt: new Date(),
			reviewDeadline: new Date(Date.now() + windowDays * 86_400_000),
			decidedAt: null,
			...options.data
		}
	});
	return updated.count > 0;
}
