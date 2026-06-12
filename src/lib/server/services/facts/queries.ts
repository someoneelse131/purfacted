import type { AuthDeps } from '../auth/session';

// Read queries for facts. Moderation-removed facts (deletedAt) are invisible.

export async function getFactDetail(deps: AuthDeps, factId: string) {
	return deps.prisma.fact.findFirst({
		where: { id: factId, deletedAt: null },
		include: {
			author: { select: { username: true, role: true } },
			category: { select: { name: true, slug: true } },
			sources: {
				where: { status: 'ACTIVE' },
				orderBy: { createdAt: 'asc' },
				include: {
					addedBy: { select: { username: true } },
					votes: { select: { value: true, weight: true, userId: true } }
				}
			}
		}
	});
}
