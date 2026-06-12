import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import {
	enqueueEmail,
	processOne,
	promoteDelayed,
	queueDepth,
	runQueueTick
} from '../../src/lib/server/services/email/queue';
import type { EmailMessage } from '../../src/lib/server/services/email/types';
import {
	createDevMailboxSender,
	readDevMailbox
} from '../../src/lib/server/services/email/transport';
import { createTestRedis } from '../helpers/test-redis';

const redis: Redis = createTestRedis();
const OPTIONS = { maxRetries: 3, backoffSeconds: 60 };

const mail: EmailMessage = {
	to: 'queue-test@example.com',
	subject: 'Test',
	html: '<p>hi</p>',
	text: 'hi'
};

beforeEach(async () => {
	await redis.flushdb();
});

afterAll(async () => {
	await redis.quit();
});

describe('email queue', () => {
	it('delivers queued mail', async () => {
		const sent: EmailMessage[] = [];
		await enqueueEmail(redis, mail);
		const processed = await processOne(
			redis,
			async (m) => {
				sent.push(m);
			},
			OPTIONS
		);
		expect(processed).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(mail.to);
		expect(await queueDepth(redis)).toEqual({ ready: 0, delayed: 0, dead: 0 });
	});

	it('schedules a delayed retry on failure with backoff', async () => {
		await enqueueEmail(redis, mail);
		const failingSend = async () => {
			throw new Error('SMTP down');
		};
		const now = Date.now();
		await processOne(redis, failingSend, OPTIONS, now);
		expect((await queueDepth(redis)).delayed).toBe(1);

		// not due yet
		expect(await promoteDelayed(redis, now + 59_000)).toBe(0);
		// due after the base backoff
		expect(await promoteDelayed(redis, now + 61_000)).toBe(1);
		expect((await queueDepth(redis)).ready).toBe(1);
	});

	it('moves mail to the dead queue after max retries', async () => {
		await enqueueEmail(redis, mail);
		const failingSend = async () => {
			throw new Error('SMTP down');
		};
		let now = Date.now();
		for (let attempt = 0; attempt < OPTIONS.maxRetries; attempt++) {
			await processOne(redis, failingSend, OPTIONS, now);
			now += 10 * 60_000; // jump past any backoff
			await promoteDelayed(redis, now);
		}
		const depth = await queueDepth(redis);
		expect(depth.dead).toBe(1);
		expect(depth.ready).toBe(0);
		expect(depth.delayed).toBe(0);
	});

	it('retries transient failures and eventually delivers', async () => {
		const sent: EmailMessage[] = [];
		let failures = 2;
		const flakySend = async (m: EmailMessage) => {
			if (failures-- > 0) throw new Error('transient');
			sent.push(m);
		};
		await enqueueEmail(redis, mail);
		let now = Date.now();
		for (let i = 0; i < 5 && sent.length === 0; i++) {
			await promoteDelayed(redis, now);
			await processOne(redis, flakySend, OPTIONS, now);
			now += 10 * 60_000;
		}
		expect(sent).toHaveLength(1);
	});

	it('runQueueTick drains the ready queue', async () => {
		const sent: EmailMessage[] = [];
		for (let i = 0; i < 5; i++) {
			await enqueueEmail(redis, { ...mail, subject: `Mail ${i}` });
		}
		await runQueueTick(
			redis,
			async (m) => {
				sent.push(m);
			},
			OPTIONS
		);
		expect(sent).toHaveLength(5);
	});

	it('dev mailbox sender stores mails readable per recipient', async () => {
		const send = createDevMailboxSender(redis);
		await send(mail);
		await send({ ...mail, subject: 'Second' });
		const box = await readDevMailbox(redis, 'Queue-Test@example.com');
		expect(box).toHaveLength(2);
		expect(box[0].subject).toBe('Second'); // newest first
	});
});
