import { describe, expect, it } from 'vitest';
import {
	LEADERBOARD_WINDOWS,
	leaderboardCacheKey,
	windowCutoff,
	type LeaderboardWindow
} from './leaderboard';

// Pure, DB-free checks for the leaderboard windowing + cache-key contract
// (R28). The aggregation itself is covered by the integration tests.

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;

describe('leaderboard windows (R28)', () => {
	it('all-time has no cutoff', () => {
		expect(windowCutoff('all', NOW)).toBeNull();
	});

	it('week looks back 7 days', () => {
		expect(windowCutoff('week', NOW)?.getTime()).toBe(NOW.getTime() - 7 * DAY);
	});

	it('month looks back 30 days', () => {
		expect(windowCutoff('month', NOW)?.getTime()).toBe(NOW.getTime() - 30 * DAY);
	});

	it('advertises exactly week, month and all-time', () => {
		expect([...LEADERBOARD_WINDOWS].sort()).toEqual(['all', 'month', 'week']);
	});
});

describe('leaderboard cache keys (R28)', () => {
	it('namespaces the global board per window', () => {
		expect(leaderboardCacheKey('week')).toBe('leaderboard:week:all');
		expect(leaderboardCacheKey('all')).toBe('leaderboard:all:all');
	});

	it('namespaces per-category boards by category id', () => {
		expect(leaderboardCacheKey('month', 'cat-123')).toBe('leaderboard:month:cat-123');
	});

	it('produces a distinct key per (window, scope) pair', () => {
		const keys = new Set<string>();
		const windows: LeaderboardWindow[] = ['week', 'month', 'all'];
		for (const w of windows) {
			keys.add(leaderboardCacheKey(w));
			keys.add(leaderboardCacheKey(w, 'cat-a'));
			keys.add(leaderboardCacheKey(w, 'cat-b'));
		}
		expect(keys.size).toBe(9);
	});
});

describe('leaderboard config contract (R28)', () => {
	it('defines numeric size and cache-ttl defaults', async () => {
		const { CONFIG_DEFAULTS } = await import('../config-defaults');
		for (const key of ['leaderboard.size', 'leaderboard.cache_ttl_seconds']) {
			const entry = CONFIG_DEFAULTS.find((c) => c.key === key);
			expect(entry, key).toBeDefined();
			expect(Number.isNaN(Number(entry?.value))).toBe(false);
			expect(Number(entry?.value)).toBeGreaterThan(0);
		}
	});
});
