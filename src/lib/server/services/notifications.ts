import type { Notification, Prisma } from '@prisma/client';
import type { AuthDeps } from './auth/session';

// In-app notifications (R32): per-recipient, with read state, delivered live
// over SSE. createNotification is best-effort (it must never break the action
// that triggered it) and publishes to a Redis channel so connected clients
// update without a reload. The notifications table is the durable backing and
// the source of the unread count.

export type NotificationType =
	| 'fact_decided'
	| 'veto_received'
	| 'comment_reply'
	| 'badge_earned'
	| 'moderation_outcome';

// The client-facing shape (also the SSE payload). Dates are serialized.
export interface NotificationView {
	id: string;
	type: NotificationType;
	summary: string;
	link: string;
	read: boolean;
	createdAt: string;
}

export function notificationChannel(userId: string): string {
	return `notif:${userId}`;
}

// Pure: a short human description of a notification from its type + payload.
export function notificationSummary(type: NotificationType, payload: unknown): string {
	const p = (payload ?? {}) as Record<string, unknown>;
	switch (type) {
		case 'fact_decided': {
			const status = String(p.status ?? '').toLowerCase();
			return status ? `Your claim was ${status}` : 'Your claim was decided';
		}
		case 'veto_received':
			return 'Your claim was contested by a veto';
		case 'comment_reply':
			return 'Someone replied to your comment';
		case 'badge_earned':
			return p.badgeName ? `You earned the "${p.badgeName}" badge` : 'You earned a new badge';
		case 'moderation_outcome':
			return p.outcome === 'removed'
				? 'A report you filed led to content being removed'
				: 'A report you filed was reviewed';
		default:
			return 'You have a new notification';
	}
}

// Pure: where clicking the notification takes the user.
export function notificationLink(n: { factId: string | null }): string {
	return n.factId ? `/facts/${n.factId}` : '/';
}

export function toView(n: Notification): NotificationView {
	return {
		id: n.id,
		type: n.type as NotificationType,
		summary: notificationSummary(n.type as NotificationType, n.payload),
		link: notificationLink(n),
		read: n.readAt !== null,
		createdAt: n.createdAt.toISOString()
	};
}

export interface CreateNotificationInput {
	userId: string;
	type: NotificationType;
	// when equal to userId the notification is skipped (no self-notifications)
	actorId?: string | null;
	factId?: string | null;
	subjectId?: string | null;
	payload?: Prisma.InputJsonValue;
}

// Best-effort: records the notification and publishes it live. Swallows and
// logs errors so a notification failure never rolls back the originating action.
export async function createNotification(
	deps: AuthDeps,
	input: CreateNotificationInput
): Promise<void> {
	if (input.actorId && input.actorId === input.userId) return; // don't notify yourself
	try {
		const row = await deps.prisma.notification.create({
			data: {
				userId: input.userId,
				type: input.type,
				factId: input.factId ?? null,
				subjectId: input.subjectId ?? null,
				payload: input.payload ?? {}
			}
		});
		const unread = await unreadCount(deps, input.userId);
		try {
			await deps.redis.publish(
				notificationChannel(input.userId),
				JSON.stringify({ item: toView(row), unread })
			);
		} catch {
			// live delivery is best-effort; the row is already durable
		}
	} catch (err) {
		console.error('notification create failed:', err);
	}
}

export async function unreadCount(deps: AuthDeps, userId: string): Promise<number> {
	return deps.prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(
	deps: AuthDeps,
	userId: string,
	limit = 20
): Promise<NotificationView[]> {
	const rows = await deps.prisma.notification.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		take: limit
	});
	return rows.map(toView);
}

// Marks one notification read. Scoped to the owner so a user can only touch
// their own. Returns the new unread count.
export async function markRead(deps: AuthDeps, userId: string, id: string): Promise<number> {
	await deps.prisma.notification.updateMany({
		where: { id, userId, readAt: null },
		data: { readAt: new Date() }
	});
	return unreadCount(deps, userId);
}

export async function markAllRead(deps: AuthDeps, userId: string): Promise<number> {
	await deps.prisma.notification.updateMany({
		where: { userId, readAt: null },
		data: { readAt: new Date() }
	});
	return 0;
}
