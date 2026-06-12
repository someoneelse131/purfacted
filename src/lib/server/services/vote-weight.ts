import type { Role } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';

// Vote weight engine (R9): final = base(role, category) x reputation modifier.
// Anonymous, unverified, banned and organization accounts vote with 0.

export interface VotingUser {
	id: string;
	role: Role;
	reputation: number;
	emailVerifiedAt: Date | null;
	bannedUntil: Date | null;
	deletedAt: Date | null;
}

export function computeModifier(
	reputation: number,
	divisor: number,
	min: number,
	max: number
): number {
	return Math.min(max, Math.max(min, 1 + reputation / divisor));
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

export async function getVoteWeight(
	deps: AuthDeps,
	user: VotingUser | null,
	categoryId: string
): Promise<number> {
	if (!user) return 0; // anonymous
	if (user.deletedAt) return 0;
	if (!user.emailVerifiedAt) return 0; // unverified accounts cannot vote
	if (user.bannedUntil && user.bannedUntil > new Date()) return 0; // banned = read-only
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
