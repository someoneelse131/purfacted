import { describe, expect, it } from 'vitest';
import { computeModifier } from './vote-weight';

describe('computeModifier', () => {
	it('is 1.0 at reputation 0', () => {
		expect(computeModifier(0, 200, 0.5, 1.5)).toBe(1);
	});

	it('scales linearly with reputation', () => {
		expect(computeModifier(100, 200, 0.5, 1.5)).toBe(1.5);
		expect(computeModifier(50, 200, 0.5, 1.5)).toBe(1.25);
		expect(computeModifier(-50, 200, 0.5, 1.5)).toBe(0.75);
	});

	it('clamps at both ends', () => {
		expect(computeModifier(10_000, 200, 0.5, 1.5)).toBe(1.5);
		expect(computeModifier(-10_000, 200, 0.5, 1.5)).toBe(0.5);
	});
});
