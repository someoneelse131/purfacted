import type { AuthDeps } from '../auth/session';
import { logAction } from '../moderation';
import { normalizeUrl } from './evidence';

// Duplicate merge (R27). A moderator marks one fact as a duplicate of a
// canonical fact (`duplicateOfId`). The duplicate's page then redirects to the
// canonical. Sources on the duplicate whose URL is not yet on the canonical are
// moved over (their votes ride along via the FK). The merge is logged and
// idempotent: re-merging the same pair is a no-op success.

export type MergeResult =
	| { ok: true; canonicalId: string; movedSources: number }
	| { ok: false; error: string };

export async function mergeFacts(
	deps: AuthDeps,
	input: { duplicateId: string; canonicalId: string; moderatorId: string }
): Promise<MergeResult> {
	if (input.duplicateId === input.canonicalId) {
		return { ok: false, error: 'A fact cannot be a duplicate of itself.' };
	}

	// defense in depth: the route guard requires a moderator, but the service
	// must not trust its callers
	const moderator = await deps.prisma.user.findUnique({
		where: { id: input.moderatorId },
		select: { role: true, deletedAt: true }
	});
	if (
		!moderator ||
		moderator.deletedAt ||
		(moderator.role !== 'MODERATOR' && moderator.role !== 'ADMIN')
	) {
		return { ok: false, error: 'Only moderators can merge facts.' };
	}

	const [duplicate, canonical] = await Promise.all([
		deps.prisma.fact.findFirst({ where: { id: input.duplicateId, deletedAt: null } }),
		deps.prisma.fact.findFirst({ where: { id: input.canonicalId, deletedAt: null } })
	]);
	if (!duplicate) return { ok: false, error: 'Duplicate fact not found.' };
	if (!canonical) return { ok: false, error: 'Canonical fact not found.' };

	// idempotent: already merged into this exact canonical
	if (duplicate.duplicateOfId === canonical.id) {
		return { ok: true, canonicalId: canonical.id, movedSources: 0 };
	}
	if (duplicate.duplicateOfId) {
		return { ok: false, error: 'This fact is already merged into another fact.' };
	}
	// no chains: the canonical must be a real target, not itself a duplicate
	if (canonical.duplicateOfId) {
		return {
			ok: false,
			error: 'The target fact is itself a duplicate - merge into its canonical instead.'
		};
	}
	// don't bury a fact that other duplicates already point at
	const dependents = await deps.prisma.fact.count({ where: { duplicateOfId: duplicate.id } });
	if (dependents > 0) {
		return { ok: false, error: 'Other facts are merged into this one; resolve those first.' };
	}

	// move sources whose normalized URL is not already present on the canonical
	const [dupSources, canonSources] = await Promise.all([
		deps.prisma.source.findMany({
			where: { factId: duplicate.id, status: 'ACTIVE' },
			select: { id: true, url: true }
		}),
		deps.prisma.source.findMany({ where: { factId: canonical.id }, select: { url: true } })
	]);
	const canonUrls = new Set(canonSources.map((s) => normalizeUrl(s.url)));
	const moveIds = dupSources.filter((s) => !canonUrls.has(normalizeUrl(s.url))).map((s) => s.id);

	await deps.prisma.$transaction([
		...(moveIds.length > 0
			? [
					deps.prisma.source.updateMany({
						where: { id: { in: moveIds } },
						data: { factId: canonical.id }
					})
				]
			: []),
		deps.prisma.fact.update({
			where: { id: duplicate.id },
			data: { duplicateOfId: canonical.id }
		})
	]);

	await logAction(
		deps,
		input.moderatorId,
		'merge_fact',
		'FACT',
		duplicate.id,
		`Merged into ${canonical.id}; moved ${moveIds.length} source(s)`
	);

	return { ok: true, canonicalId: canonical.id, movedSources: moveIds.length };
}
