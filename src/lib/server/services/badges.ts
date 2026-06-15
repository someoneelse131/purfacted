import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';
import { emitActivity } from './activity';
import { createNotification } from './notifications';

// Badge engine (R22): rule-based awards, each granted exactly once via a
// unique (userId, badge) row. Rules read existing data (mostly the reputation
// ledger from R21) so evaluation is idempotent and can run after any action.

export interface BadgeDef {
	key: string;
	name: string;
	description: string;
	earned: (deps: AuthDeps, userId: string) => Promise<boolean>;
}

async function countConsensusSources(deps: AuthDeps, userId: string): Promise<number> {
	return deps.prisma.reputationEvent.count({
		where: { userId, action: 'source_consensus' }
	});
}

// Distinct UTC days with review activity (source votes or sources added).
async function reviewActivityDays(deps: AuthDeps, userId: string): Promise<string[]> {
	const [votes, sources] = await Promise.all([
		deps.prisma.sourceVote.findMany({ where: { userId }, select: { createdAt: true } }),
		deps.prisma.source.findMany({ where: { addedById: userId }, select: { createdAt: true } })
	]);
	const days = new Set<string>();
	for (const row of [...votes, ...sources]) {
		days.add(row.createdAt.toISOString().slice(0, 10));
	}
	return [...days].sort();
}

function hasConsecutiveRun(sortedDays: string[], length: number): boolean {
	if (sortedDays.length < length) return false;
	let run = 1;
	for (let i = 1; i < sortedDays.length; i++) {
		const prev = Date.parse(sortedDays[i - 1] + 'T00:00:00Z');
		const curr = Date.parse(sortedDays[i] + 'T00:00:00Z');
		if (curr - prev === 86_400_000) {
			run += 1;
			if (run >= length) return true;
		} else {
			run = 1;
		}
	}
	return false;
}

// Exposed for unit testing the pure helpers.
export const __test = { hasConsecutiveRun };

export const BADGES: BadgeDef[] = [
	{
		key: 'first_verdict',
		name: 'First Verdict',
		description: 'Cast your first vote on a source.',
		earned: async (deps, userId) => (await deps.prisma.sourceVote.count({ where: { userId } })) >= 1
	},
	{
		key: 'source_hunter',
		name: 'Source Hunter',
		description: 'Add sources that reached positive consensus.',
		earned: async (deps, userId) => {
			const needed = await getConfigNumber(deps, 'badge.source_hunter_count');
			return (await countConsensusSources(deps, userId)) >= needed;
		}
	},
	{
		key: 'veto_verified',
		name: 'Veto Verified',
		description: 'Land your first successful veto.',
		earned: async (deps, userId) =>
			(await deps.prisma.reputationEvent.count({
				where: { userId, action: 'veto_succeeded' }
			})) >= 1
	},
	{
		key: 'streak',
		name: 'Streak',
		description: 'Review on several consecutive days.',
		earned: async (deps, userId) => {
			const length = await getConfigNumber(deps, 'badge.streak_days');
			return hasConsecutiveRun(await reviewActivityDays(deps, userId), length);
		}
	}
];

const BADGE_BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

// Expert badges (R34) are dynamic: their key encodes the verified field as
// `expert:<field>`. They have no `earned` rule (granted by the experts
// service on approval), so they resolve their display meta from the key.
export const EXPERT_BADGE_PREFIX = 'expert:';

export function expertBadgeKey(field: string): string {
	return `${EXPERT_BADGE_PREFIX}${field}`;
}

export function badgeMeta(key: string): { name: string; description: string } | null {
	if (key.startsWith(EXPERT_BADGE_PREFIX)) {
		const field = key.slice(EXPERT_BADGE_PREFIX.length);
		return { name: `Expert: ${field}`, description: 'Verified domain expert.' };
	}
	const def = BADGE_BY_KEY.get(key);
	return def ? { name: def.name, description: def.description } : null;
}

async function awardBadge(deps: AuthDeps, userId: string, badge: string): Promise<boolean> {
	try {
		await deps.prisma.userBadge.create({ data: { userId, badge } });
		return true;
	} catch (err) {
		if (
			typeof err === 'object' &&
			err !== null &&
			'code' in err &&
			(err as { code?: string }).code === 'P2002'
		) {
			return false; // already earned
		}
		throw err;
	}
}

// Evaluates all badge rules for a user and grants any newly earned. Returns
// the keys awarded in this run (for notifications later).
export async function evaluateBadges(deps: AuthDeps, userId: string): Promise<string[]> {
	const earnedKeys = new Set(
		(await deps.prisma.userBadge.findMany({ where: { userId }, select: { badge: true } })).map(
			(b) => b.badge
		)
	);
	const newlyAwarded: string[] = [];
	for (const def of BADGES) {
		if (earnedKeys.has(def.key)) continue;
		if (await def.earned(deps, userId)) {
			if (await awardBadge(deps, userId, def.key)) {
				newlyAwarded.push(def.key);
				await emitActivity(deps, {
					type: 'badge_earned',
					actorId: userId,
					subjectType: 'BADGE',
					subjectId: def.key,
					payload: { badge: def.key }
				});
				// notify the earner (R32) - no actorId guard: a badge is your own
				await createNotification(deps, {
					userId,
					type: 'badge_earned',
					subjectId: def.key,
					payload: { badge: def.key, badgeName: def.name }
				});
			}
		}
	}
	return newlyAwarded;
}

export interface EarnedBadge {
	key: string;
	name: string;
	description: string;
	awardedAt: Date;
}

export async function listBadges(deps: AuthDeps, userId: string): Promise<EarnedBadge[]> {
	const rows = await deps.prisma.userBadge.findMany({
		where: { userId },
		orderBy: { awardedAt: 'asc' }
	});
	return rows.flatMap((row) => {
		const meta = badgeMeta(row.badge);
		return meta ? [{ key: row.badge, ...meta, awardedAt: row.awardedAt }] : [];
	});
}
