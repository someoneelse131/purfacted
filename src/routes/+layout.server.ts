import type { LayoutServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listNotifications, unreadCount } from '$lib/server/services/notifications';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { user: null, notifications: { items: [], unread: 0 } };
	}
	const deps = authDeps();
	const [items, unread] = await Promise.all([
		listNotifications(deps, locals.user.id),
		unreadCount(deps, locals.user.id)
	]);
	return { user: locals.user, notifications: { items, unread } };
};
