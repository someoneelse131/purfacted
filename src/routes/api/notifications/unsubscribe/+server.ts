import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processUnsubscribe, unsubscribeFromAll } from '$lib/server/services/emailNotification';
import type { NotificationType } from '@prisma/client';

const VALID_TYPES: NotificationType[] = [
	'TRUST_LOST',
	'TRUST_GAINED',
	'FACT_REPLY',
	'FACT_DISPUTED',
	'VETO_RECEIVED',
	'VERIFICATION_RESULT',
	'ORG_COMMENT',
	'DEBATE_REQUEST',
	'DEBATE_PUBLISHED',
	'MODERATOR_STATUS',
	'FACT_STATUS'
];

/**
 * GET /api/notifications/unsubscribe - One-click unsubscribe from email
 */
export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	const type = url.searchParams.get('type') as NotificationType;
	const token = url.searchParams.get('token');
	const all = url.searchParams.get('all') === 'true';

	if (!userId) {
		throw error(400, 'Missing userId');
	}

	if (!token) {
		throw error(400, 'Missing token');
	}

	// Unsubscribe from all
	if (all) {
		// For unsubscribe all, we need a valid token for any type
		let validToken = false;
		for (const t of VALID_TYPES) {
			const success = await processUnsubscribe(userId, t, token);
			if (success) {
				validToken = true;
				break;
			}
		}

		if (!validToken) {
			throw error(400, 'Invalid unsubscribe link');
		}

		await unsubscribeFromAll(userId);

		// Return HTML response for better UX
		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Unsubscribed</title>
				<style>
					body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
					h1 { color: #333; }
					p { color: #666; }
					a { color: #3b82f6; }
				</style>
			</head>
			<body>
				<h1>Unsubscribed</h1>
				<p>You have been unsubscribed from all email notifications.</p>
				<p>You can manage your notification preferences in your <a href="/user/settings">account settings</a>.</p>
			</body>
			</html>
			`,
			{
				headers: {
					'Content-Type': 'text/html'
				}
			}
		);
	}

	// Single type unsubscribe
	if (!type || !VALID_TYPES.includes(type)) {
		throw error(400, 'Invalid notification type');
	}

	const success = await processUnsubscribe(userId, type, token);

	if (!success) {
		throw error(400, 'Invalid unsubscribe link');
	}

	// Return HTML response
	const typeName = type.toLowerCase().replace('_', ' ');

	return new Response(
		`
		<!DOCTYPE html>
		<html>
		<head>
			<title>Unsubscribed</title>
			<style>
				body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
				h1 { color: #333; }
				p { color: #666; }
				a { color: #3b82f6; }
			</style>
		</head>
		<body>
			<h1>Unsubscribed</h1>
			<p>You have been unsubscribed from ${typeName} email notifications.</p>
			<p>You can manage your notification preferences in your <a href="/user/settings">account settings</a>.</p>
			<p><a href="/api/notifications/unsubscribe?userId=${userId}&type=${type}&token=${token}&all=true">Unsubscribe from all email notifications</a></p>
		</body>
		</html>
		`,
		{
			headers: {
				'Content-Type': 'text/html'
			}
		}
	);
};
