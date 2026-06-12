import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getRedis } from '$lib/server/redis';
import { readDevMailbox } from '$lib/server/services/email/transport';

// Dev-only: lets local testing and E2E read mails captured by the dev mailbox
// transport. Disabled unless EMAIL_DEV_MAILBOX=true (never set in production).
export const GET: RequestHandler = async ({ url }) => {
	if (env.EMAIL_DEV_MAILBOX !== 'true') {
		error(404, 'Not found');
	}
	const to = url.searchParams.get('to');
	if (!to) error(400, 'Missing "to" query parameter');
	const mails = await readDevMailbox(getRedis(), to);
	return json({ mails });
};
