import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedConfig } from '../../prisma/seed';
import { createNotification } from '../../src/lib/server/services/notifications';
import { flushEmailNotifications } from '../../src/lib/server/services/email/notify';
import type { EmailMessage } from '../../src/lib/server/services/email/types';
import { processOne } from '../../src/lib/server/services/email/queue';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };

const WINDOW_MS = 6 * 3600 * 1000;
const FLUSH = { windowMs: WINDOW_MS, origin: 'https://purfacted.com', secret: 'test-secret' };

beforeAll(async () => {
	prisma = await setupTestDb();
	redis = createTestRedis();
	deps = { prisma, redis };
}, 120_000);

beforeEach(async () => {
	await truncateAll(prisma);
	await redis.flushdb();
	await seedConfig(prisma);
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
async function makeUser(over: Partial<Prisma.UserCreateInput> = {}): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `en${counter}`,
			email: `en${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date(),
			...over
		}
	});
}

// Drain the email queue with a capturing sender so the test can assert what
// the flush actually enqueued.
async function drainMailbox(): Promise<EmailMessage[]> {
	const sent: EmailMessage[] = [];
	const send = async (m: EmailMessage) => {
		sent.push(m);
	};
	while (await processOne(redis, send, { maxRetries: 3, backoffSeconds: 60 })) {
		/* keep draining */
	}
	return sent;
}

describe('email notifications (R33)', () => {
	it('aggregates several notifications into a single batched email', async () => {
		const user = await makeUser();
		await createNotification(deps, {
			userId: user.id,
			type: 'fact_decided',
			payload: { status: 'VERIFIED' }
		});
		await createNotification(deps, { userId: user.id, type: 'comment_reply' });

		const sent = await flushEmailNotifications(deps, FLUSH);
		expect(sent).toBe(1);

		const mails = await drainMailbox();
		expect(mails).toHaveLength(1);
		expect(mails[0].to).toBe(user.email);
		expect(mails[0].text).toContain('Your claim was verified');
		expect(mails[0].text).toContain('Someone replied to your comment');

		// every processed notification is stamped and the rate anchor advanced
		const remaining = await prisma.notification.count({
			where: { userId: user.id, emailedAt: null }
		});
		expect(remaining).toBe(0);
		const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.lastEmailNotifyAt).not.toBeNull();
	});

	it('respects per-type opt-outs (no mail for a disabled type)', async () => {
		const user = await makeUser({ emailNotifyPrefs: { comment_reply: false } });
		await createNotification(deps, { userId: user.id, type: 'comment_reply' });
		await createNotification(deps, {
			userId: user.id,
			type: 'badge_earned',
			payload: { badgeName: 'Source Hunter' }
		});

		await flushEmailNotifications(deps, FLUSH);
		const mails = await drainMailbox();
		expect(mails).toHaveLength(1);
		expect(mails[0].text).not.toContain('replied');
		expect(mails[0].text).toContain('Source Hunter');
	});

	it('sends nothing (but stamps) when every pending type is opted out', async () => {
		const user = await makeUser({ emailNotifyPrefs: { comment_reply: false } });
		await createNotification(deps, { userId: user.id, type: 'comment_reply' });

		const sent = await flushEmailNotifications(deps, FLUSH);
		expect(sent).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
		// stamped so it is not re-scanned forever; rate anchor untouched
		const remaining = await prisma.notification.count({
			where: { userId: user.id, emailedAt: null }
		});
		expect(remaining).toBe(0);
		const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.lastEmailNotifyAt).toBeNull();
	});

	it('batches: a user emailed within the window is not mailed again', async () => {
		// emailed one second ago -> still inside the 6h window
		const user = await makeUser({ lastEmailNotifyAt: new Date(Date.now() - 1000) });
		await createNotification(deps, {
			userId: user.id,
			type: 'fact_decided',
			payload: { status: 'REFUTED' }
		});

		const sent = await flushEmailNotifications(deps, FLUSH);
		expect(sent).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
		// the notification waits for the next window (still unstamped)
		const remaining = await prisma.notification.count({
			where: { userId: user.id, emailedAt: null }
		});
		expect(remaining).toBe(1);
	});

	it('mails once the window has elapsed, then the next batch waits', async () => {
		// last mail was longer than the window ago -> due now
		const user = await makeUser({ lastEmailNotifyAt: new Date(Date.now() - WINDOW_MS - 1000) });
		await createNotification(deps, {
			userId: user.id,
			type: 'fact_decided',
			payload: { status: 'DISPUTED' }
		});

		expect(await flushEmailNotifications(deps, FLUSH)).toBe(1);
		expect(await drainMailbox()).toHaveLength(1);

		// a second notification right after must wait for the freshly-set window
		await createNotification(deps, { userId: user.id, type: 'comment_reply' });
		expect(await flushEmailNotifications(deps, FLUSH)).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
	});

	it('skips users with the master email toggle off', async () => {
		const user = await makeUser({ notifyEmail: false });
		await createNotification(deps, { userId: user.id, type: 'badge_earned' });
		expect(await flushEmailNotifications(deps, FLUSH)).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
	});

	it('skips users whose email is not verified', async () => {
		const user = await makeUser({ emailVerifiedAt: null });
		await createNotification(deps, {
			userId: user.id,
			type: 'fact_decided',
			payload: { status: 'VERIFIED' }
		});
		expect(await flushEmailNotifications(deps, FLUSH)).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
	});

	it('does not batch moderation_outcome (it has its own immediate mail)', async () => {
		const user = await makeUser();
		await createNotification(deps, {
			userId: user.id,
			type: 'moderation_outcome',
			payload: { outcome: 'removed' }
		});
		expect(await flushEmailNotifications(deps, FLUSH)).toBe(0);
		expect(await drainMailbox()).toHaveLength(0);
		// the moderation notification stays untouched by the batch path
		const remaining = await prisma.notification.count({
			where: { userId: user.id, emailedAt: null }
		});
		expect(remaining).toBe(1);
	});
});
