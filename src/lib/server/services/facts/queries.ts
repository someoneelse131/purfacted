import type { AuthDeps } from '../auth/session';

// Read queries for facts. The Review Hub (R13) and main feed (R14) extend
// these; R10 needs the basics.

export async function getFactDetail(deps: AuthDeps, factId: string) {
	return deps.prisma.fact.findUnique({
		where: { id: factId },
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

export async function listUnderReview(deps: AuthDeps, take = 50) {
	return deps.prisma.fact.findMany({
		where: { status: 'UNDER_REVIEW' },
		orderBy: { createdAt: 'desc' },
		take,
		include: {
			category: { select: { name: true, slug: true } },
			author: { select: { username: true } },
			_count: { select: { sources: true } }
		}
	});
}
