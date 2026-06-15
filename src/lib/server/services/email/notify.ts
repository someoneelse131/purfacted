import type { AuthDeps } from '../auth/session';
import { notificationLink, notificationSummary, type NotificationType } from '../notifications';
import { createUnsubscribeToken } from './unsubscribe';
import { renderNotificationEmail } from './templates';
import { enqueueEmail } from './queue';

// Email notifications (R33): a batched consumer of the R32 notifications table.
// Instead of mailing on every event, a worker periodically gathers a user's
// un-emailed notifications and sends ONE aggregated mail per rate window, so a
// burst of activity never floods the inbox. Per-type opt-outs live on the user
// (default ON); the global `notifyEmail` flag is the master switch.
//
// moderation_outcome is deliberately NOT batched here - it already gets its own
// immediate, content-rich mail from the moderation service (R17). The batched
// path covers the remaining four notification types.

export const EMAIL_BATCH_TYPES = [
	'fact_decided',
	'veto_received',
	'comment_reply',
	'badge_earned'
] as const satisfies readonly NotificationType[];

export type EmailBatchType = (typeof EMAIL_BATCH_TYPES)[number];

export function isEmailBatchType(type: string): type is EmailBatchType {
	return (EMAIL_BATCH_TYPES as readonly string[]).includes(type);
}

// Per-type opt-out: a notification type emails unless the user explicitly set
// its preference to false. Missing key / malformed blob => default ON.
export function isTypeEmailEnabled(type: string, prefs: unknown): boolean {
	if (!prefs || typeof prefs !== 'object') return true;
	return (prefs as Record<string, unknown>)[type] !== false;
}

// The batching gate: a user may receive at most one batched mail per window.
export function isUserDue(lastSent: Date | null, now: Date, windowMs: number): boolean {
	if (!lastSent) return true;
	return now.getTime() - lastSent.getTime() >= windowMs;
}

export interface BatchItem {
	summary: string;
	link: string;
}

// Aggregates several notifications into one email body (subject + html + text).
export function buildBatchEmail(
	items: BatchItem[],
	origin: string
): { subject: string; bodyHtml: string; bodyText: string } {
	const n = items.length;
	const subject = `${n} new ${n === 1 ? 'update' : 'updates'} on PurFacted`;
	const rows = items
		.map(
			(item) =>
				`<li style="margin:0 0 8px"><a href="${origin}${item.link}" style="color:#0f172a">${item.summary}</a></li>`
		)
		.join('\n');
	const bodyHtml = `<p>You have ${n} new ${n === 1 ? 'update' : 'updates'} on PurFacted:</p>
<ul style="padding-left:18px">
${rows}
</ul>`;
	const bodyText = `You have ${n} new ${n === 1 ? 'update' : 'updates'} on PurFacted:

${items.map((item) => `- ${item.summary}: ${origin}${item.link}`).join('\n')}`;
	return { subject, bodyHtml, bodyText };
}

export interface FlushOptions {
	now?: Date;
	windowMs: number;
	origin: string;
	secret: string;
	maxPerBatch?: number;
}

// Worker entry point: find users due for a batched mail and send one aggregated
// email each from their un-emailed, opted-in notifications. Best-effort - a
// failure for one user never blocks the others. Returns the number of mails
// enqueued (useful for tests/metrics).
export async function flushEmailNotifications(
	deps: AuthDeps,
	options: FlushOptions
): Promise<number> {
	const now = options.now ?? new Date();
	const dueCutoff = new Date(now.getTime() - options.windowMs);
	const maxPerBatch = options.maxPerBatch ?? 50;

	// candidate recipients: have an un-emailed batched notification AND are
	// eligible (verified, not deleted, master toggle on) AND past the window
	const candidates = await deps.prisma.notification.findMany({
		where: {
			emailedAt: null,
			type: { in: [...EMAIL_BATCH_TYPES] },
			user: {
				notifyEmail: true,
				emailVerifiedAt: { not: null },
				deletedAt: null,
				OR: [{ lastEmailNotifyAt: null }, { lastEmailNotifyAt: { lte: dueCutoff } }]
			}
		},
		distinct: ['userId'],
		select: { userId: true }
	});

	let sent = 0;
	for (const { userId } of candidates) {
		try {
			if (await flushUser(deps, userId, now, options.origin, options.secret, maxPerBatch)) {
				sent += 1;
			}
		} catch (err) {
			console.error('email-notify flush failed for user', userId, err);
		}
	}
	return sent;
}

async function flushUser(
	deps: AuthDeps,
	userId: string,
	now: Date,
	origin: string,
	secret: string,
	maxPerBatch: number
): Promise<boolean> {
	const user = await deps.prisma.user.findUnique({ where: { id: userId } });
	if (!user) return false;

	// everything created up to `now` is in scope; concurrent inserts after this
	// point keep emailedAt null and ride the next window
	const pending = await deps.prisma.notification.findMany({
		where: {
			userId,
			emailedAt: null,
			type: { in: [...EMAIL_BATCH_TYPES] },
			createdAt: { lte: now }
		},
		orderBy: { createdAt: 'asc' },
		take: maxPerBatch
	});
	if (pending.length === 0) return false;

	const emailable = pending.filter((n) => isTypeEmailEnabled(n.type, user.emailNotifyPrefs));

	let enqueued = false;
	if (emailable.length > 0) {
		const items: BatchItem[] = emailable.map((n) => ({
			summary: notificationSummary(n.type as NotificationType, n.payload),
			link: notificationLink(n)
		}));
		const { subject, bodyHtml, bodyText } = buildBatchEmail(items, origin);
		const unsubscribeToken = createUnsubscribeToken(userId, 'notifications', secret);
		const rendered = renderNotificationEmail({
			username: user.username,
			subject,
			bodyHtml,
			bodyText,
			unsubscribeUrl: `${origin}/unsubscribe/${unsubscribeToken}`
		});
		await enqueueEmail(deps.redis, { to: user.email, ...rendered });
		enqueued = true;
	}

	// stamp ALL processed notifications (incl. opted-out ones) so they don't
	// linger as candidates; only advance the rate anchor when a mail was sent
	await deps.prisma.notification.updateMany({
		where: { id: { in: pending.map((n) => n.id) } },
		data: { emailedAt: now }
	});
	if (enqueued) {
		await deps.prisma.user.update({
			where: { id: userId },
			data: { lastEmailNotifyAt: now }
		});
	}
	return enqueued;
}
