import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';

// Puts a fact back to UNDER_REVIEW with a fresh window (R13 revive, R16 veto).
export async function reopenReview(deps: AuthDeps, factId: string): Promise<boolean> {
	const windowDays = await getConfigNumber(deps, 'quorum.review_window_days');
	const updated = await deps.prisma.fact.updateMany({
		where: { id: factId },
		data: {
			status: 'UNDER_REVIEW',
			reviewStartedAt: new Date(),
			reviewDeadline: new Date(Date.now() + windowDays * 86_400_000),
			decidedAt: null
		}
	});
	return updated.count > 0;
}
