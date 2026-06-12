import type { Redis } from 'ioredis';
import type { EmailMessage, QueuedEmail, SendEmailFn } from './types';

// Redis-backed email queue with retry + exponential backoff.
// Lists/sets used:
//   email:queue   - ready to send (LPUSH / RPOP)
//   email:delayed - sorted set, score = timestamp when the retry is due
//   email:dead    - delivery permanently failed (kept for inspection)

const QUEUE = 'email:queue';
const DELAYED = 'email:delayed';
const DEAD = 'email:dead';

export interface QueueOptions {
	maxRetries: number;
	backoffSeconds: number;
}

export async function enqueueEmail(redis: Redis, mail: EmailMessage): Promise<void> {
	const queued: QueuedEmail = { ...mail, attempts: 0, enqueuedAt: Date.now() };
	await redis.lpush(QUEUE, JSON.stringify(queued));
}

// Move retries whose backoff elapsed back into the ready queue.
export async function promoteDelayed(redis: Redis, now = Date.now()): Promise<number> {
	const due = await redis.zrangebyscore(DELAYED, 0, now);
	for (const entry of due) {
		await redis.zrem(DELAYED, entry);
		await redis.lpush(QUEUE, entry);
	}
	return due.length;
}

// Process a single queued mail. Returns false when the queue is empty.
export async function processOne(
	redis: Redis,
	send: SendEmailFn,
	options: QueueOptions,
	now = Date.now()
): Promise<boolean> {
	const raw = await redis.rpop(QUEUE);
	if (!raw) return false;
	const mail = JSON.parse(raw) as QueuedEmail;
	try {
		await send(mail);
	} catch {
		mail.attempts += 1;
		if (mail.attempts >= options.maxRetries) {
			await redis.lpush(DEAD, JSON.stringify(mail));
		} else {
			const backoffMs = options.backoffSeconds * 1000 * 2 ** (mail.attempts - 1);
			await redis.zadd(DELAYED, now + backoffMs, JSON.stringify(mail));
		}
	}
	return true;
}

// One worker tick: promote due retries, then drain the ready queue.
export async function runQueueTick(
	redis: Redis,
	send: SendEmailFn,
	options: QueueOptions,
	maxPerTick = 20
): Promise<void> {
	await promoteDelayed(redis);
	for (let i = 0; i < maxPerTick; i++) {
		if (!(await processOne(redis, send, options))) break;
	}
}

export async function queueDepth(redis: Redis): Promise<{
	ready: number;
	delayed: number;
	dead: number;
}> {
	const [ready, delayed, dead] = await Promise.all([
		redis.llen(QUEUE),
		redis.zcard(DELAYED),
		redis.llen(DEAD)
	]);
	return { ready, delayed, dead };
}
