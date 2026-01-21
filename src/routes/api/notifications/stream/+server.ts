import type { RequestHandler } from './$types';
import { getUnreadCount, getUserNotifications } from '$lib/server/services/notification';

/**
 * GET /api/notifications/stream - Server-Sent Events for real-time notifications
 *
 * Client connects to this endpoint and receives real-time notification updates.
 * Uses SSE (Server-Sent Events) which is simpler than WebSockets for one-way communication.
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const userId = locals.user.id;

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let isClosed = false;
			let interval: ReturnType<typeof setInterval> | null = null;
			let heartbeat: ReturnType<typeof setInterval> | null = null;

			// Cleanup function to properly close everything
			const cleanup = () => {
				if (isClosed) return;
				isClosed = true;
				if (interval) clearInterval(interval);
				if (heartbeat) clearInterval(heartbeat);
				try {
					controller.close();
				} catch {
					// Controller may already be closed
				}
			};

			// Send initial connection event (checks if closed before writing)
			const sendEvent = (event: string, data: unknown) => {
				if (isClosed) return false;
				try {
					const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(message));
					return true;
				} catch {
					// Controller closed, cleanup
					cleanup();
					return false;
				}
			};

			// Handle client disconnect - single listener for all cleanup
			request.signal.addEventListener('abort', cleanup);

			// Send initial unread count
			try {
				const unreadCount = await getUnreadCount(userId);
				sendEvent('count', { unreadCount });
			} catch (err) {
				console.error('Error getting initial count:', err);
			}

			// Set up polling interval (every 5 seconds)
			// In production, use Redis pub/sub or a message queue for real-time updates
			let lastCount = 0;
			let lastNotificationId: string | null = null;

			const checkForUpdates = async () => {
				if (isClosed) return;
				try {
					const unreadCount = await getUnreadCount(userId);

					// Only send update if count changed
					if (unreadCount !== lastCount) {
						lastCount = unreadCount;
						if (!sendEvent('count', { unreadCount })) return;

						// If count increased, fetch the new notification
						if (unreadCount > 0) {
							const notifications = await getUserNotifications(userId, {
								unreadOnly: true,
								limit: 1
							});

							if (notifications.length > 0 && notifications[0].id !== lastNotificationId) {
								lastNotificationId = notifications[0].id;
								sendEvent('notification', notifications[0]);
							}
						}
					}
				} catch (err) {
					if (!isClosed) {
						console.error('Error checking for updates:', err);
					}
				}
			};

			// Initial check
			await checkForUpdates();

			// Set up interval
			interval = setInterval(checkForUpdates, 5000);

			// Keep connection alive with heartbeat
			heartbeat = setInterval(() => {
				sendEvent('heartbeat', { timestamp: Date.now() });
			}, 30000);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
