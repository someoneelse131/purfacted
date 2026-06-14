import { describe, expect, it } from 'vitest';
import type { ActivityType } from './activity';

// Pure contract checks for the activity spine (R25) that need no database:
// the retention config the pruning job reads must exist, and the event-type
// union must stay in sync with what the emitting services advertise.

const EMITTED_TYPES: ActivityType[] = [
	'fact_submitted',
	'fact_decided',
	'fact_status_changed',
	'veto_opened',
	'veto_resolved',
	'source_added',
	'comment_added',
	'badge_earned'
];

describe('activity spine config contract', () => {
	it('pruning reads a numeric activity.retention_days default', async () => {
		const { CONFIG_DEFAULTS } = await import('../config-defaults');
		const entry = CONFIG_DEFAULTS.find((c) => c.key === 'activity.retention_days');
		expect(entry).toBeDefined();
		expect(Number.isNaN(Number(entry?.value))).toBe(false);
		expect(Number(entry?.value)).toBeGreaterThan(0);
	});

	it('every advertised event type is distinct', () => {
		expect(new Set(EMITTED_TYPES).size).toBe(EMITTED_TYPES.length);
	});
});
