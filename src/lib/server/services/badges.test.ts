import { describe, expect, it } from 'vitest';
import { __test } from './badges';

describe('streak detection (R22)', () => {
	const { hasConsecutiveRun } = __test;

	it('finds a run of the required length', () => {
		expect(hasConsecutiveRun(['2026-06-01', '2026-06-02', '2026-06-03'], 3)).toBe(true);
	});

	it('rejects gaps', () => {
		expect(hasConsecutiveRun(['2026-06-01', '2026-06-02', '2026-06-04'], 3)).toBe(false);
	});

	it('finds a run that is not at the start', () => {
		expect(hasConsecutiveRun(['2026-05-01', '2026-06-10', '2026-06-11', '2026-06-12'], 3)).toBe(
			true
		);
	});

	it('needs enough days', () => {
		expect(hasConsecutiveRun(['2026-06-01', '2026-06-02'], 3)).toBe(false);
		expect(hasConsecutiveRun([], 1)).toBe(false);
	});
});
