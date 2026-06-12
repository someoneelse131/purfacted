import { describe, expect, it } from 'vitest';
import { levelForReputation } from './profile';

const THRESHOLDS = '0,50,150,400,1000';

describe('levelForReputation', () => {
	it('maps reputation to levels via thresholds', () => {
		expect(levelForReputation(THRESHOLDS, 0)).toBe(1);
		expect(levelForReputation(THRESHOLDS, 49)).toBe(1);
		expect(levelForReputation(THRESHOLDS, 50)).toBe(2);
		expect(levelForReputation(THRESHOLDS, 150)).toBe(3);
		expect(levelForReputation(THRESHOLDS, 399)).toBe(3);
		expect(levelForReputation(THRESHOLDS, 400)).toBe(4);
		expect(levelForReputation(THRESHOLDS, 5000)).toBe(5);
	});

	it('clamps negative reputation to level 1', () => {
		expect(levelForReputation(THRESHOLDS, -30)).toBe(1);
	});

	it('tolerates whitespace in the config value', () => {
		expect(levelForReputation('0, 50, 150', 60)).toBe(2);
	});
});
