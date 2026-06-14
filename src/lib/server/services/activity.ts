import type { Prisma } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';

// Activity event spine (R25): one append-only table that records the
// noteworthy things happening on the platform. It is built *before* the
// features that consume it - the home feed (R30), hotspots (R31), in-app and
// email notifications (R32/R33) and the weekly digest (R38) all read from
// here instead of re-querying every core table.
//
// Emitting is best-effort: a failure to record an event must never roll back
// or break the action that produced it (the spine is derived data).

export type ActivityType =
	| 'fact_submitted'
	| 'fact_decided'
	| 'fact_status_changed'
	| 'veto_opened'
	| 'veto_resolved'
	| 'source_added'
	| 'comment_added'
	| 'badge_earned';

export type ActivitySubjectType = 'FACT' | 'SOURCE' | 'COMMENT' | 'VETO' | 'BADGE';

export interface EmitInput {
	type: ActivityType;
	// null for system-driven events (status decided/expired by the worker)
	actorId?: string | null;
	subjectType: ActivitySubjectType;
	subjectId: string;
	// denormalized so category-/fact-scoped feeds read without a join
	factId?: string | null;
	categoryId?: string | null;
	payload?: Prisma.InputJsonValue;
}

// Writes one activity event. Best-effort: swallows and logs errors so the
// originating service action is never affected by spine failures.
export async function emitActivity(deps: AuthDeps, input: EmitInput): Promise<void> {
	try {
		await deps.prisma.activityEvent.create({
			data: {
				type: input.type,
				actorId: input.actorId ?? null,
				subjectType: input.subjectType,
				subjectId: input.subjectId,
				factId: input.factId ?? null,
				categoryId: input.categoryId ?? null,
				payload: input.payload ?? {}
			}
		});
	} catch (err) {
		console.error('activity emit failed:', err);
	}
}

// Retention/pruning: deletes events older than activity.retention_days.
// Returns how many rows were removed. Idempotent and cheap when nothing
// matches (the createdAt index makes the range delete fast).
export async function pruneActivity(deps: AuthDeps, now: Date = new Date()): Promise<number> {
	const retentionDays = await getConfigNumber(deps, 'activity.retention_days');
	const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
	const result = await deps.prisma.activityEvent.deleteMany({
		where: { createdAt: { lt: cutoff } }
	});
	return result.count;
}

// --- feed-shaped reads (foundation for R30/R31) -------------------------

export async function recentActivity(deps: AuthDeps, take = 50) {
	return deps.prisma.activityEvent.findMany({
		orderBy: { createdAt: 'desc' },
		take
	});
}

export async function activityForCategory(deps: AuthDeps, categoryId: string, take = 50) {
	return deps.prisma.activityEvent.findMany({
		where: { categoryId },
		orderBy: { createdAt: 'desc' },
		take
	});
}

export async function activityForActor(deps: AuthDeps, actorId: string, take = 50) {
	return deps.prisma.activityEvent.findMany({
		where: { actorId },
		orderBy: { createdAt: 'desc' },
		take
	});
}
