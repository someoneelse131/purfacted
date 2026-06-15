import { Prisma } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';

// Leaderboards (R28): week / month / all-time rankings by reputation *gained*
// in the window, read from the append-only reputation_events ledger (R21).
// Per-category boards resolve each event back to a category through its
// subject. Boards are cached in Redis and pre-warmed periodically by a worker
// (leaderboard-worker.ts); reads are read-through so an unwarmed board still
// resolves. Users with the "hide stats" privacy setting are never listed.

export type LeaderboardWindow = 'week' | 'month' | 'all';

export const LEADERBOARD_WINDOWS: readonly LeaderboardWindow[] = ['week', 'month', 'all'] as const;

// "week" and "month" name fixed look-back spans; they define what the windows
// mean rather than being business-tunable, so they live here as constants.
const WINDOW_DAYS: Record<Exclude<LeaderboardWindow, 'all'>, number> = {
	week: 7,
	month: 30
};

const CACHE_PREFIX = 'leaderboard:';

export interface LeaderboardEntry {
	userId: string;
	username: string;
	role: string;
	reputation: number;
	gained: number;
	rank: number;
}

export interface LeaderboardOptions {
	window: LeaderboardWindow;
	categoryId?: string;
	limit?: number;
}

// The start of the window, or null for all-time (no lower bound).
export function windowCutoff(window: LeaderboardWindow, now: Date = new Date()): Date | null {
	if (window === 'all') return null;
	return new Date(now.getTime() - WINDOW_DAYS[window] * 86_400_000);
}

export function leaderboardCacheKey(window: LeaderboardWindow, categoryId?: string): string {
	return `${CACHE_PREFIX}${window}:${categoryId ?? 'all'}`;
}

interface RankRow {
	userId: string;
	username: string;
	role: string;
	reputation: number;
	gained: number;
}

// Aggregates the ledger directly. This is the testable business logic; the
// cache is a thin layer on top (getLeaderboard / refreshLeaderboards).
export async function computeLeaderboard(
	deps: AuthDeps,
	opts: LeaderboardOptions
): Promise<LeaderboardEntry[]> {
	const limit = opts.limit ?? (await getConfigNumber(deps, 'leaderboard.size'));
	const cutoff = windowCutoff(opts.window);
	const cutoffCond = cutoff ? Prisma.sql`AND re."createdAt" >= ${cutoff}` : Prisma.empty;

	let rows: RankRow[];
	if (opts.categoryId) {
		// Resolve each event to a category through its subject: fact events key on
		// the fact, veto events on the veto (-> fact), source/vote events on the
		// source (-> fact). cuids are globally unique so only one join matches.
		rows = await deps.prisma.$queryRaw<RankRow[]>`
			SELECT u.id AS "userId", u.username, u.role::text AS role, u.reputation,
			       SUM(re.points)::int AS gained
			FROM reputation_events re
			JOIN users u ON u.id = re."userId"
			LEFT JOIN facts f ON f.id = re."subjectId"
			LEFT JOIN vetoes v ON v.id = re."subjectId"
			LEFT JOIN sources s ON s.id = re."subjectId"
			LEFT JOIN facts vf ON vf.id = v."factId"
			LEFT JOIN facts sf ON sf.id = s."factId"
			WHERE u."hideStats" = false AND u."deletedAt" IS NULL
			${cutoffCond}
			AND COALESCE(f."categoryId", vf."categoryId", sf."categoryId") = ${opts.categoryId}
			GROUP BY u.id
			HAVING SUM(re.points) > 0
			ORDER BY gained DESC, u.reputation DESC, u.username ASC
			LIMIT ${limit}`;
	} else {
		rows = await deps.prisma.$queryRaw<RankRow[]>`
			SELECT u.id AS "userId", u.username, u.role::text AS role, u.reputation,
			       SUM(re.points)::int AS gained
			FROM reputation_events re
			JOIN users u ON u.id = re."userId"
			WHERE u."hideStats" = false AND u."deletedAt" IS NULL
			${cutoffCond}
			GROUP BY u.id
			HAVING SUM(re.points) > 0
			ORDER BY gained DESC, u.reputation DESC, u.username ASC
			LIMIT ${limit}`;
	}

	return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

// Read-through cache: returns the cached board if warm, otherwise computes and
// caches it. Cache failures degrade gracefully to a direct computation.
export async function getLeaderboard(
	deps: AuthDeps,
	opts: LeaderboardOptions
): Promise<LeaderboardEntry[]> {
	const key = leaderboardCacheKey(opts.window, opts.categoryId);
	try {
		const cached = await deps.redis.get(key);
		if (cached !== null) return JSON.parse(cached) as LeaderboardEntry[];
	} catch {
		// cache unavailable -> compute directly
	}
	const board = await computeLeaderboard(deps, opts);
	await writeCache(deps, key, board);
	return board;
}

async function writeCache(deps: AuthDeps, key: string, board: LeaderboardEntry[]): Promise<void> {
	try {
		const ttl = await getConfigNumber(deps, 'leaderboard.cache_ttl_seconds');
		await deps.redis.set(key, JSON.stringify(board), 'EX', ttl);
	} catch {
		// cache write failures must never break reads
	}
}

// Recomputes and overwrites the cached boards. Called by the periodic worker so
// reads stay warm. Refreshes every window globally and per active top-level
// category (the boards the UI offers).
export async function refreshLeaderboards(deps: AuthDeps): Promise<void> {
	const categories = await deps.prisma.category.findMany({
		where: { status: 'ACTIVE', parentId: null },
		select: { id: true }
	});

	for (const window of LEADERBOARD_WINDOWS) {
		const global = await computeLeaderboard(deps, { window });
		await writeCache(deps, leaderboardCacheKey(window), global);

		for (const category of categories) {
			const board = await computeLeaderboard(deps, { window, categoryId: category.id });
			await writeCache(deps, leaderboardCacheKey(window, category.id), board);
		}
	}
}
