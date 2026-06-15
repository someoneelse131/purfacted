import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis';
import { notificationChannel } from '$lib/server/services/notifications';

// Server-Sent Events stream for live in-app notifications (R32). The client's
// EventSource subscribes here; createNotification publishes to the per-user
// Redis channel and each message is forwarded as an SSE `notification` event.
//
// nginx note: the central proxy must set `proxy_buffering off` on this route or
// events are buffered and never reach the browser live.
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return new Response('Unauthorized', { status: 401 });

	// a subscribed ioredis connection can't run normal commands, so use a
	// dedicated duplicate per stream
	const sub = getRedis().duplicate();
	const channel = notificationChannel(user.id);
	const encoder = new TextEncoder();

	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (event: string, data: string) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
				} catch {
					// controller already closed
				}
			};

			sub.on('message', (_channel, message) => send('notification', message));
			sub.on('error', () => {});
			try {
				await sub.subscribe(channel);
			} catch {
				// if subscription fails the stream still stays open (heartbeat only)
			}

			// initial comment + periodic heartbeat keep the connection alive through
			// proxies and let the client know it is connected
			send('ready', '{}');
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// closed
				}
			}, 25_000);
		},
		async cancel() {
			if (heartbeat) clearInterval(heartbeat);
			try {
				await sub.unsubscribe(channel);
			} catch {
				// ignore
			}
			sub.disconnect();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// disable proxy buffering (nginx) so events flush immediately
			'x-accel-buffering': 'no'
		}
	});
};
