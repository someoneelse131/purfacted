import { describe, expect, it } from 'vitest';

describe('ci-verify', () => {
	it('deliberately fails to prove CI catches failures', () => {
		expect(1).toBe(2);
	});
});
