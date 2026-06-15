import type { Prisma } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import type { ActivityType } from './activity';
import { getFollowedIds } from './follows';

// Home feed (R30): a personalized activity stream built on top of the activity
// event spine (R25). It surfaces the events happening around the users and
// categories you follow (R29) - new claims, status changes and vetoes. When the
// personalized stream is empty (you follow nothing, or nothing has happened
// there yet) it falls back to the global stream, which is also available as its
// own tab.

export type HomeFeedTab = 'following' | 'global';

// The event types worth showing in the feed: new claims, evidence, status
// decisions/changes and veto activity. badge_earned/comment_added are
// deliberately excluded - they are personal/low-signal for a discovery feed.
export const HOME_FEED_TYPES: readonly ActivityType[] = [
	'fact_submitted',
	'source_added',
	'fact_decided',
	'fact_status_changed',
	'veto_opened',
	'veto_resolved'
] as const;

export interface HomeFeedItem {
	id: string;
	type: ActivityType;
	createdAt: Date;
	actorUsername: string | null;
	factId: string | null;
	factTitle: string | null;
	categoryName: string | null;
	categorySlug: string | null;
	// short human description of what happened, derived from type + payload
	summary: string;
}

export interface HomeFeed {
	items: HomeFeedItem[];
	tab: HomeFeedTab;
	// true when the "following" tab fell back to global activity (no follows
	// yet, or nothing has happened in the followed scope)
	fellBack: boolean;
}

// Pure: a short, surface-agnostic description of an event. Reads the payload
// defensively so a missing/legacy payload can never throw.
export function activitySummary(type: ActivityType, payload: unknown): string {
	const p = (payload ?? {}) as Record<string, unknown>;
	switch (type) {
		case 'fact_submitted':
			return 'submitted a new claim';
		case 'source_added':
			return p.side === 'CONTRA' ? 'added opposing evidence' : 'added supporting evidence';
		case 'fact_decided':
			return decidedSummary(String(p.status ?? ''));
		case 'fact_status_changed':
			return p.restored
				? 'returned to its previous status'
				: p.status === 'UNSUBSTANTIATED'
					? 'became unsubstantiated (no quorum)'
					: `changed status to ${String(p.status ?? '').toLowerCase()}`;
		case 'veto_opened':
			return 'was contested by a veto';
		case 'veto_resolved':
			return p.outcome === 'SUCCEEDED' ? 'veto upheld - status changed' : 'veto dismissed';
		default:
			return 'activity';
	}
}

function decidedSummary(status: string): string {
	switch (status) {
		case 'VERIFIED':
			return 'was verified';
		case 'DISPUTED':
			return 'was disputed';
		case 'REFUTED':
			return 'was refuted';
		default:
			return 'was decided';
	}
}

// An activity event with the relations the feed needs joined in.
type EnrichedEvent = Prisma.ActivityEventGetPayload<{
	include: {
		actor: { select: { username: true; deletedAt: true } };
		fact: { select: { id: true; title: true; deletedAt: true } };
		category: { select: { name: true; slug: true } };
	};
}>;

// Pure mapping from a joined event row to a feed item. A soft-deleted actor is
// shown as anonymous; the fact link is dropped when the fact is gone.
export function toHomeFeedItem(event: EnrichedEvent): HomeFeedItem {
	const factAlive = event.fact && event.fact.deletedAt === null;
	return {
		id: event.id,
		type: event.type as ActivityType,
		createdAt: event.createdAt,
		actorUsername: event.actor && event.actor.deletedAt === null ? event.actor.username : null,
		factId: factAlive ? event.fact!.id : null,
		factTitle: factAlive ? event.fact!.title : null,
		categoryName: event.category?.name ?? null,
		categorySlug: event.category?.slug ?? null,
		summary: activitySummary(event.type as ActivityType, event.payload)
	};
}

const INCLUDE = {
	actor: { select: { username: true, deletedAt: true } },
	fact: { select: { id: true, title: true, deletedAt: true } },
	category: { select: { name: true, slug: true } }
} as const;

async function queryEvents(
	deps: AuthDeps,
	where: Prisma.ActivityEventWhereInput,
	take: number
): Promise<HomeFeedItem[]> {
	// The where clause already restricts to events with a live fact, so every
	// row maps to a linkable item.
	const events = await deps.prisma.activityEvent.findMany({
		where: { ...where, type: { in: [...HOME_FEED_TYPES] } },
		orderBy: { createdAt: 'desc' },
		take,
		include: INCLUDE
	});
	return events.map(toHomeFeedItem);
}

// The global activity stream (also the empty-state fallback for "following").
export async function getGlobalFeed(deps: AuthDeps, take = 50): Promise<HomeFeedItem[]> {
	return queryEvents(deps, { fact: { is: { deletedAt: null } } }, take);
}

export async function getHomeFeed(
	deps: AuthDeps,
	input: { userId: string; tab?: HomeFeedTab; take?: number }
): Promise<HomeFeed> {
	const take = input.take ?? 50;
	if (input.tab === 'global') {
		return { items: await getGlobalFeed(deps, take), tab: 'global', fellBack: false };
	}

	const { userIds, categoryIds } = await getFollowedIds(deps, input.userId);
	if (userIds.length === 0 && categoryIds.length === 0) {
		// nothing followed yet -> show global activity so the page is never blank
		return { items: await getGlobalFeed(deps, take), tab: 'following', fellBack: true };
	}

	const items = await queryEvents(
		deps,
		{
			fact: { is: { deletedAt: null } },
			OR: [{ actorId: { in: userIds } }, { categoryId: { in: categoryIds } }]
		},
		take
	);
	if (items.length === 0) {
		return { items: await getGlobalFeed(deps, take), tab: 'following', fellBack: true };
	}
	return { items, tab: 'following', fellBack: false };
}
