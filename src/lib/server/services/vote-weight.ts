import type { Role } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber, getConfigValue } from './config';

// Vote weight engine (R9 + R24): final = base(role, category) x reputation
// modifier x probation factor. Anonymous, unverified, banned and organization
// accounts vote with 0.

export interface VotingUser {
	id: string;
	role: Role;
	reputation: number;
	emailVerifiedAt: Date | null;
	bannedUntil: Date | null;
	deletedAt: Date | null;
	createdAt: Date;
}

export function computeModifier(
	reputation: number,
	divisor: number,
	min: number,
	max: number
): number {
	return Math.min(max, Math.max(min, 1 + reputation / divisor));
}

export type ProbationEndMode = 'ANY' | 'ALL';

export interface ProbationConfig {
	minReputation: number;
	minAccountAgeDays: number;
	endMode: ProbationEndMode;
}

// Probation (R24): fresh accounts vote at reduced weight and do not count
// toward the reviewer quorum. ANY (default) ends probation as soon as EITHER
// the reputation OR the account-age threshold is passed; ALL requires both.
export function isOnProbation(
	reputation: number,
	accountAgeDays: number,
	config: ProbationConfig
): boolean {
	const repBelow = reputation < config.minReputation;
	const ageBelow = accountAgeDays < config.minAccountAgeDays;
	return config.endMode === 'ANY' ? repBelow && ageBelow : repBelow || ageBelow;
}

async function probationConfig(deps: AuthDeps): Promise<ProbationConfig> {
	const [minReputation, minAccountAgeDays, endModeRaw] = await Promise.all([
		getConfigNumber(deps, 'probation.min_reputation'),
		getConfigNumber(deps, 'probation.min_account_age_days'),
		getConfigValue(deps, 'probation.end_mode')
	]);
	return {
		minReputation,
		minAccountAgeDays,
		endMode: endModeRaw === 'ALL' ? 'ALL' : 'ANY'
	};
}

// Whether the user is currently on probation, using config thresholds.
export async function userOnProbation(
	deps: AuthDeps,
	user: { reputation: number; createdAt: Date },
	now = new Date()
): Promise<boolean> {
	const config = await probationConfig(deps);
	const accountAgeDays = (now.getTime() - user.createdAt.getTime()) / 86_400_000;
	return isOnProbation(user.reputation, accountAgeDays, config);
}

async function isExpertInCategory(
	deps: AuthDeps,
	userId: string,
	categoryId: string
): Promise<boolean> {
	const category = await deps.prisma.category.findUnique({
		where: { id: categoryId },
		select: { id: true, parentId: true }
	});
	if (!category) return false;
	// expertise in a top category also covers its children
	const relevant = [category.id, ...(category.parentId ? [category.parentId] : [])];
	const match = await deps.prisma.expertCategory.count({
		where: { userId, categoryId: { in: relevant } }
	});
	return match > 0;
}

export interface VoteContext {
	weight: number;
	// snapshotted with the vote (R24): probation reviewers don't count for quorum
	onProbation: boolean;
}

// Base review weight (R9): role base x reputation modifier. Probation is NOT
// applied here - it is a review-integrity mechanism layered on by
// getVoteContext for source votes only. Comment votes (sibling sorting, no
// reputation effect) use this base weight directly.
export async function getVoteWeight(
	deps: AuthDeps,
	user: VotingUser | null,
	categoryId: string,
	now = new Date()
): Promise<number> {
	if (!user) return 0; // anonymous
	if (user.deletedAt) return 0;
	if (!user.emailVerifiedAt) return 0; // unverified accounts cannot vote
	if (user.bannedUntil && user.bannedUntil > now) return 0; // banned = read-only
	if (user.role === 'ORGANIZATION') return 0; // official statements instead

	let base: number;
	switch (user.role) {
		case 'EXPERT':
			base = (await isExpertInCategory(deps, user.id, categoryId))
				? await getConfigNumber(deps, 'weight.expert')
				: await getConfigNumber(deps, 'weight.verified');
			break;
		case 'MODERATOR':
		case 'ADMIN':
			base = await getConfigNumber(deps, 'weight.moderator');
			break;
		default:
			base = await getConfigNumber(deps, 'weight.verified');
	}

	const [divisor, min, max] = await Promise.all([
		getConfigNumber(deps, 'rep.modifier.divisor'),
		getConfigNumber(deps, 'rep.modifier.min'),
		getConfigNumber(deps, 'rep.modifier.max')
	]);
	return base * computeModifier(user.reputation, divisor, min, max);
}

// Resolves the effective review (source) vote weight together with the
// probation flag, so a vote is snapshotted exactly as it counted (R24). On
// probation the base weight is reduced and the vote will not count as a
// distinct reviewer toward the quorum.
export async function getVoteContext(
	deps: AuthDeps,
	user: VotingUser | null,
	categoryId: string,
	now = new Date()
): Promise<VoteContext> {
	const weight = await getVoteWeight(deps, user, categoryId, now);
	if (weight <= 0 || !user) return { weight: 0, onProbation: false };

	const onProbation = await userOnProbation(deps, user, now);
	if (!onProbation) return { weight, onProbation: false };

	const probationFactor = await getConfigNumber(deps, 'probation.weight_factor');
	return { weight: weight * probationFactor, onProbation: true };
}
