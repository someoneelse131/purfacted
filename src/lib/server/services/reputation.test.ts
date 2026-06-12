import { describe, expect, it } from 'vitest';
import type { ReputationAction } from './reputation';

// The action->config-key mapping is the contract the payout sites rely on;
// a pure check guards against typos without needing a database.
const ACTIONS: ReputationAction[] = [
	'fact_verified',
	'fact_refuted',
	'veto_succeeded',
	'veto_failed',
	'source_consensus',
	'source_removed',
	'vote_matched_consensus'
];

describe('reputation action keys', () => {
	it('every action maps to a rep.* config default', async () => {
		const { CONFIG_DEFAULTS } = await import('../config-defaults');
		const keys = new Set(CONFIG_DEFAULTS.map((c) => c.key));
		for (const action of ACTIONS) {
			expect(keys.has(`rep.${action}`)).toBe(true);
		}
	});
});
