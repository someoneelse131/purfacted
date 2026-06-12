import type { Redis } from 'ioredis';
import type { QueuedEmail } from '../../src/lib/server/services/email/types';

// Tokens are stored hashed at rest (SHA-256), so tests cannot read them from
// the DB anymore. Extract the raw token from the queued mail instead - the
// same way a real user gets it. LPUSH means index 0 is the newest mail.
export async function tokenFromMail(redis: Redis, to: string, pathPart: string): Promise<string> {
	const entries = await redis.lrange('email:queue', 0, -1);
	for (const raw of entries) {
		const mail = JSON.parse(raw) as QueuedEmail;
		if (mail.to !== to) continue;
		const match = mail.text.match(new RegExp(`${pathPart}([A-Za-z0-9_-]+)`));
		if (match) return match[1];
	}
	throw new Error(`No queued mail with a ${pathPart} link for ${to}`);
}
