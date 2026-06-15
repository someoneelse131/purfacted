import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedConfig } from '../../prisma/seed';
import {
	createNotification,
	listNotifications,
	markAllRead,
	markRead,
	notificationChannel,
	unreadCount
} from '../../src/lib/server/services/notifications';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };

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
async function makeUser(): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `nf${counter}`,
			email: `nf${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
}

describe('notifications', () => {
	it('creates a notification and counts it as unread', async () => {
		const user = await makeUser();
		await createNotification(deps, {
			userId: user.id,
			type: 'fact_decided',
			factId: 'f1',
			payload: { status: 'VERIFIED' }
		});
		expect(await unreadCount(deps, user.id)).toBe(1);
		const list = await listNotifications(deps, user.id);
		expect(list).toHaveLength(1);
		expect(list[0].summary).toBe('Your claim was verified');
		expect(list[0].link).toBe('/facts/f1');
		expect(list[0].read).toBe(false);
	});

	it('does not notify yourself when actorId equals the recipient', async () => {
		const user = await makeUser();
		await createNotification(deps, {
			userId: user.id,
			type: 'comment_reply',
			actorId: user.id,
			factId: 'f1'
		});
		expect(await unreadCount(deps, user.id)).toBe(0);
	});

	it('publishes the new notification on the user channel', async () => {
		const user = await makeUser();
		const sub = redis.duplicate();
		const received: string[] = [];
		await sub.subscribe(notificationChannel(user.id));
		sub.on('message', (_c, m) => received.push(m));

		await createNotification(deps, { userId: user.id, type: 'badge_earned', payload: {} });
		// give pub/sub a tick to deliver
		await new Promise((r) => setTimeout(r, 100));

		expect(received).toHaveLength(1);
		const parsed = JSON.parse(received[0]) as { item: { type: string }; unread: number };
		expect(parsed.item.type).toBe('badge_earned');
		expect(parsed.unread).toBe(1);
		await sub.unsubscribe();
		sub.disconnect();
	});

	it('marks a single notification read and recomputes the unread count', async () => {
		const user = await makeUser();
		await createNotification(deps, { userId: user.id, type: 'fact_decided', factId: 'a' });
		await createNotification(deps, { userId: user.id, type: 'fact_decided', factId: 'b' });
		const list = await listNotifications(deps, user.id);
		expect(await unreadCount(deps, user.id)).toBe(2);

		const remaining = await markRead(deps, user.id, list[0].id);
		expect(remaining).toBe(1);
	});

	it('marks all read', async () => {
		const user = await makeUser();
		await createNotification(deps, { userId: user.id, type: 'fact_decided', factId: 'a' });
		await createNotification(deps, { userId: user.id, type: 'fact_decided', factId: 'b' });

		expect(await markAllRead(deps, user.id)).toBe(0);
		expect(await unreadCount(deps, user.id)).toBe(0);
	});

	it("scopes mark-read to the owner - cannot mark another user's notification", async () => {
		const owner = await makeUser();
		const other = await makeUser();
		await createNotification(deps, { userId: owner.id, type: 'fact_decided', factId: 'a' });
		const [n] = await listNotifications(deps, owner.id);

		// other user tries to mark the owner's notification -> no effect
		await markRead(deps, other.id, n.id);
		expect(await unreadCount(deps, owner.id)).toBe(1);
	});
});
