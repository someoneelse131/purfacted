// Default values for the `config` table (REQUIREMENTS.md Part A).
// Seeded by prisma/seed.ts; read at runtime via the config service (R9).
// Values are stored as strings and parsed by the config service.

export interface ConfigDefault {
	key: string;
	value: string;
	description: string;
}

export const CONFIG_DEFAULTS: ConfigDefault[] = [
	// Base vote weights per role
	{ key: 'weight.verified', value: '1', description: 'Base vote weight for verified users' },
	{
		key: 'weight.expert',
		value: '3',
		description: 'Base vote weight for experts inside their categories'
	},
	{ key: 'weight.moderator', value: '1', description: 'Base vote weight for moderators' },

	// Reputation modifier: clamp(1 + reputation / divisor, min, max)
	{ key: 'rep.modifier.divisor', value: '200', description: 'Reputation modifier divisor' },
	{ key: 'rep.modifier.min', value: '0.5', description: 'Reputation modifier lower clamp' },
	{ key: 'rep.modifier.max', value: '1.5', description: 'Reputation modifier upper clamp' },

	// Reputation points per action
	{ key: 'rep.fact_verified', value: '10', description: 'Author points when fact is VERIFIED' },
	{ key: 'rep.fact_refuted', value: '-15', description: 'Author points when fact is REFUTED' },
	{ key: 'rep.veto_succeeded', value: '5', description: 'Points for a successful veto' },
	{ key: 'rep.veto_failed', value: '-5', description: 'Points for a failed veto' },
	{
		key: 'rep.source_consensus',
		value: '2',
		description: 'Points when an added source reaches positive consensus'
	},
	{
		key: 'rep.source_removed',
		value: '-3',
		description: 'Points when an added source is removed as misleading/spam'
	},
	{
		key: 'rep.vote_matched_consensus',
		value: '1',
		description: 'Points when a source vote matches the final consensus'
	},

	// Source credibility by type
	{ key: 'credibility.peer_reviewed', value: '5', description: 'Credibility: PEER_REVIEWED' },
	{ key: 'credibility.official', value: '4', description: 'Credibility: OFFICIAL' },
	{ key: 'credibility.news', value: '3', description: 'Credibility: NEWS' },
	{ key: 'credibility.company', value: '2', description: 'Credibility: COMPANY' },
	{ key: 'credibility.blog', value: '1', description: 'Credibility: BLOG' },
	{ key: 'credibility.other', value: '1', description: 'Credibility: OTHER' },

	// Status thresholds on the evidence balance (-1..+1)
	{
		key: 'status.verified_threshold',
		value: '0.5',
		description: 'balance >= threshold -> VERIFIED'
	},
	{
		key: 'status.refuted_threshold',
		value: '-0.5',
		description: 'balance <= threshold -> REFUTED'
	},

	// Quorum
	{
		key: 'quorum.min_total_weight',
		value: '15',
		description: 'Minimum total vote weight across all sources'
	},
	{ key: 'quorum.min_reviewers', value: '5', description: 'Minimum distinct reviewers' },
	{
		key: 'quorum.min_review_hours',
		value: '48',
		description: 'Minimum hours a review must stay open'
	},
	{
		key: 'quorum.review_window_days',
		value: '14',
		description: 'Days until an undecided fact becomes UNSUBSTANTIATED'
	}
];
