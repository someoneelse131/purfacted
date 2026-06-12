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
	{ key: 'facts.title_max', value: '200', description: 'Maximum fact title length' },
	{ key: 'facts.body_max', value: '3000', description: 'Maximum fact body length' },
	{ key: 'facts.max_per_day', value: '5', description: 'Max fact submissions per user per day' },

	// Sources (R11)
	{ key: 'sources.title_min', value: '3', description: 'Minimum source title length' },
	{ key: 'sources.title_max', value: '200', description: 'Maximum source title length' },

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
	}
];
