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
	{ key: 'rep.fact_refuted', value: '-2', description: 'Author points when fact is REFUTED' },
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
	{
		key: 'rep.early_vote_weight_threshold',
		value: '5',
		description:
			'A consensus-match vote only earns points while the source had less than this accumulated absolute vote weight (R24 early-vote bonus)'
	},

	// Scoring / confidence damping (R24): effectiveBalance = balance * S/(S+K)
	{
		key: 'scoring.confidence_k',
		value: '10',
		description: 'Confidence damping constant K applied to the evidence balance before status'
	},

	// Probation for fresh accounts (R24): reduced weight, excluded from quorum
	{
		key: 'probation.min_reputation',
		value: '10',
		description: 'Accounts below this reputation may still be on probation'
	},
	{
		key: 'probation.min_account_age_days',
		value: '7',
		description: 'Accounts younger than this (days) may still be on probation'
	},
	{
		key: 'probation.weight_factor',
		value: '0.5',
		description: 'Vote weight multiplier while on probation'
	},
	{
		key: 'probation.end_mode',
		value: 'ANY',
		description:
			'ANY: probation ends once reputation OR account age passes its threshold; ALL: only when both do'
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

	// Auth (R3-R5)
	{ key: 'auth.password_min_length', value: '10', description: 'Minimum password length' },
	{
		key: 'auth.password_min_score',
		value: '3',
		description: 'Minimum zxcvbn strength score (0-4)'
	},
	{
		key: 'auth.verification_token_hours',
		value: '24',
		description: 'Email verification token validity (hours)'
	},
	{ key: 'auth.session_days', value: '7', description: 'Sliding session expiry (days)' },
	{
		key: 'auth.session_remember_days',
		value: '30',
		description: 'Sliding session expiry with remember-me (days)'
	},
	{
		key: 'auth.login_max_attempts',
		value: '5',
		description: 'Failed logins per window before lockout (per account and per IP)'
	},
	{
		key: 'auth.login_window_minutes',
		value: '15',
		description: 'Window for the failed-login rate limit (minutes)'
	},
	{
		key: 'auth.reset_token_hours',
		value: '1',
		description: 'Password reset token validity (hours)'
	},
	{
		key: 'auth.reset_max_requests_per_hour',
		value: '3',
		description: 'Max password reset mails per account per hour'
	},
	{
		key: 'auth.email_change_max_per_hour',
		value: '3',
		description: 'Max email change requests per account per hour'
	},

	// Profile (R7) / Levels (R22)
	{ key: 'profile.bio_max_length', value: '500', description: 'Maximum bio length' },
	{
		key: 'levels.thresholds',
		value: '0,50,150,400,1000',
		description: 'Reputation thresholds for levels 1..n (comma-separated)'
	},
	{
		key: 'badge.source_hunter_count',
		value: '25',
		description: 'Sources with positive consensus needed for the Source Hunter badge'
	},
	{
		key: 'badge.streak_days',
		value: '7',
		description: 'Consecutive days of review activity for the Streak badge'
	},

	// Facts (R10)
	{ key: 'facts.title_min', value: '10', description: 'Minimum fact title length' },
	{ key: 'facts.title_max', value: '200', description: 'Maximum fact title length' },
	{ key: 'facts.body_max', value: '3000', description: 'Maximum fact body length' },
	{ key: 'facts.max_per_day', value: '5', description: 'Max fact submissions per user per day' },

	// Sources (R11)
	{ key: 'sources.title_min', value: '3', description: 'Minimum source title length' },
	{ key: 'sources.title_max', value: '200', description: 'Maximum source title length' },
	{
		key: 'sources.quote_min',
		value: '20',
		description: 'Minimum length of a new source quote/justification (R26)'
	},
	{
		key: 'sources.quote_max',
		value: '500',
		description: 'Maximum length of a new source quote/justification (R26)'
	},
	{
		key: 'sources.archive_enabled',
		value: 'true',
		description: 'Feature flag: queue an archive.org snapshot when a source is added (R26)'
	},
	{
		key: 'sources.archive_max_retries',
		value: '3',
		description: 'Max attempts for the archive snapshot job before dead-lettering'
	},
	{
		key: 'sources.archive_backoff_seconds',
		value: '60',
		description: 'Base backoff between archive snapshot attempts (doubles per attempt)'
	},

	// Duplicate claim detection (R27)
	{
		key: 'dedup.provider',
		value: 'trgm',
		description:
			'Similarity provider for duplicate detection: "trgm" (pg_trgm baseline) or "embedding" (R40)'
	},
	{
		key: 'dedup.min_similarity',
		value: '0.3',
		description:
			'Minimum title similarity (0-1) for a fact to be shown as a possible duplicate (R27)'
	},
	{
		key: 'dedup.candidate_limit',
		value: '5',
		description: 'Max number of similar facts shown before submission (R27)'
	},

	// Comments (R15)
	{ key: 'comments.max_length', value: '2000', description: 'Maximum comment length' },
	{ key: 'comments.max_depth', value: '4', description: 'Maximum thread depth' },
	{
		key: 'comments.edit_window_minutes',
		value: '15',
		description: 'Minutes a comment stays editable after posting'
	},
	{ key: 'comments.max_per_hour', value: '30', description: 'Max comments per user per hour' },

	// Bot prevention (R19)
	{
		key: 'ratelimit.anon_post_per_minute',
		value: '60',
		description: 'Max anonymous POST requests per IP per minute (central middleware)'
	},

	// Bans (R18)
	{ key: 'ban.level1_days', value: '3', description: 'Ban duration at escalation level 1 (days)' },
	{ key: 'ban.level2_days', value: '30', description: 'Ban duration at escalation level 2 (days)' },

	// Moderation (R17)
	{
		key: 'moderation.report_max_per_day',
		value: '10',
		description: 'Max reports per user per day'
	},
	{
		key: 'moderation.report_detail_max',
		value: '1000',
		description: 'Maximum length of the free-text detail on a report'
	},
	{
		key: 'moderation.queue_page_size',
		value: '50',
		description: 'Reports per page in the moderation queue'
	},

	// Categories (R8)
	{
		key: 'categories.propose_max_per_day',
		value: '5',
		description: 'Max category proposals per user per day'
	},
	{
		key: 'categories.page_size',
		value: '25',
		description: 'Facts per page on a category page'
	},

	// Review Hub (R13)
	{ key: 'review.page_size', value: '25', description: 'Facts per page in the Review Hub' },

	// Vetoes (R16)
	{ key: 'veto.max_per_day', value: '3', description: 'Max vetoes per user per day' },
	{
		key: 'veto.reason_min_length',
		value: '10',
		description: 'Minimum veto reason length (characters)'
	},

	// Email queue (R6)
	{ key: 'email.max_retries', value: '5', description: 'Max delivery attempts per mail' },
	{
		key: 'email.retry_backoff_seconds',
		value: '60',
		description: 'Base backoff between delivery attempts (doubles per attempt)'
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
	},

	// Activity event spine (R25)
	{
		key: 'activity.retention_days',
		value: '180',
		description: 'Days an activity event is kept before the pruning job removes it'
	}
];
