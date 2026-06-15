import type { Handle } from '@sveltejs/kit';
import { assertAppSecret } from '$lib/server/app-secret';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { SESSION_COOKIE, validateSession } from '$lib/server/services/auth/session';
import { deleteSessionCookie, setSessionCookie } from '$lib/server/services/auth/cookies';
import { getConfigNumber } from '$lib/server/services/config';
import { hitRateLimit } from '$lib/server/services/rate-limit';
import { startEmailWorker } from '$lib/server/services/email/worker';
import { startEmailNotifyWorker } from '$lib/server/services/email/notify-worker';
import { startStatusWorker } from '$lib/server/services/facts/status-worker';
import { startActivityWorker } from '$lib/server/services/activity-worker';
import { startArchiveWorker } from '$lib/server/services/archive/worker';
import { startLeaderboardWorker } from '$lib/server/services/leaderboard-worker';

// fail closed: production must not start with the known dev signing secret
assertAppSecret();
startEmailWorker();
startEmailNotifyWorker();
startStatusWorker();
startActivityWorker();
startArchiveWorker();
startLeaderboardWorker();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionToken = null;
	event.locals.suspicious = false;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const result = await validateSession({ prisma, redis: getRedis() }, token);
		if (result) {
			event.locals.user = result.user;
			event.locals.sessionToken = token;
			// keep the cookie aligned with the (possibly slid) DB expiry
			setSessionCookie(event.cookies, token, result.session.expiresAt);
		} else {
			deleteSessionCookie(event.cookies);
		}
	}

	// central per-IP limit for anonymous POSTs (R19); authenticated actions
	// have their own per-feature limits
	if (event.request.method === 'POST' && !event.locals.user) {
		const deps = { prisma, redis: getRedis() };
		const max = await getConfigNumber(deps, 'ratelimit.anon_post_per_minute');
		const limit = await hitRateLimit(deps.redis, `anonpost:${event.getClientAddress()}`, max, 60);
		if (!limit.allowed) {
			return new Response('Too many requests. Slow down.', {
				status: 429,
				headers: { 'retry-after': String(limit.retryAfterSeconds) }
			});
		}
		// half the budget burned -> treat follow-up actions as suspicious
		event.locals.suspicious = limit.remaining < max / 2;
	}

	return resolve(event);
};
