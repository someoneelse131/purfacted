import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import {
	listNotifications,
	markAllRead,
	markRead,
	unreadCount
} from '$lib/server/services/notifications';

// Read the recent notifications + unread count (used by the bell to refresh).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const deps = authDeps();
	const [items, unread] = await Promise.all([
		listNotifications(deps, locals.user.id),
		unreadCount(deps, locals.user.id)
	]);
	return json({ items, unread });
};

// Mark a single notification read ({ id }) or all of them ({ all: true }).
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	const deps = authDeps();
	const body = (await request.json().catch(() => ({}))) as { id?: string; all?: boolean };

	const unread = body.all
		? await markAllRead(deps, locals.user.id)
		: body.id
			? await markRead(deps, locals.user.id, body.id)
			: await unreadCount(deps, locals.user.id);

	return json({ unread });
};
