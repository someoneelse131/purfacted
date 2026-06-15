import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { getAppSecret } from '$lib/server/app-secret';
import { getConfigNumber } from '../config';
import { flushEmailNotifications } from './notify';

// Periodically flush batched notification emails (R33). The flush itself is the
// rate gate (one mail per window per user), so a short tick just keeps latency
// low; nothing is sent before a user's window elapses.
const TICK_MS = 60_000; // 1 minute

// Started from hooks.server.ts; globalThis guard keeps one worker across HMR.
export function startEmailNotifyWorker(): void {
	const g = globalThis as { __purfactedEmailNotifyWorker?: NodeJS.Timeout };
	if (g.__purfactedEmailNotifyWorker) return;
	if (process.env.VITEST) return;

	const deps = { prisma, redis: getRedis() };
	const origin = process.env.ORIGIN ?? 'http://localhost:3000';

	const timer = setInterval(async () => {
		try {
			const windowHours = await getConfigNumber(deps, 'email.notify_batch_window_hours');
			await flushEmailNotifications(deps, {
				windowMs: windowHours * 3600 * 1000,
				origin,
				secret: getAppSecret()
			});
		} catch (err) {
			console.error('email-notify worker tick failed:', err);
		}
	}, TICK_MS);
	timer.unref?.();
	g.__purfactedEmailNotifyWorker = timer;
}
