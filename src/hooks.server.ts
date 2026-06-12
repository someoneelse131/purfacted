import type { Handle } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { SESSION_COOKIE, validateSession } from '$lib/server/services/auth/session';
import { deleteSessionCookie, setSessionCookie } from '$lib/server/services/auth/cookies';
import { startEmailWorker } from '$lib/server/services/email/worker';

startEmailWorker();

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.sessionToken = null;

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

	return resolve(event);
};
