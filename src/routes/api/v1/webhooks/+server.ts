/**
 * Public API v1 - Webhooks Endpoint
 *
 * GET /api/v1/webhooks - List webhooks for the API key
 * POST /api/v1/webhooks - Create a new webhook subscription
 */

import type { RequestHandler } from './$types';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, apiError, API_ERRORS } from '$lib/server/api/response';
import { createWebhook, getWebhooksByApiKey, WEBHOOK_EVENTS } from '$lib/server/services/webhook';
import type { WebhookEvent } from '$lib/server/services/webhook';

export const GET: RequestHandler = async (event) => {
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const webhooks = await getWebhooksByApiKey(auth.context.apiKey.id);

		const data = webhooks.map((w) => ({
			id: w.id,
			url: w.url,
			events: w.events,
			isActive: w.isActive,
			createdAt: w.createdAt.toISOString()
		}));

		await completeApiRequest(auth.context, event, 200);
		return apiSuccess({ webhooks: data }, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 webhooks list error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};

export const POST: RequestHandler = async (event) => {
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const body = await event.request.json();
		const { url, events } = body;

		// Validate URL
		if (!url || typeof url !== 'string') {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_URL', 'Webhook URL is required', 400);
		}

		try {
			new URL(url);
		} catch {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_URL', 'Invalid webhook URL format', 400);
		}

		// Validate events
		if (!events || !Array.isArray(events) || events.length === 0) {
			await completeApiRequest(auth.context, event, 400);
			return apiError('INVALID_EVENTS', 'At least one event is required', 400);
		}

		const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
		if (invalidEvents.length > 0) {
			await completeApiRequest(auth.context, event, 400);
			return apiError(
				'INVALID_EVENTS',
				`Invalid events: ${invalidEvents.join(', ')}. Valid events: ${WEBHOOK_EVENTS.join(', ')}`,
				400
			);
		}

		// Create webhook
		const { webhook, secret } = await createWebhook({
			apiKeyId: auth.context.apiKey.id,
			url,
			events: events as WebhookEvent[]
		});

		const data = {
			id: webhook.id,
			url: webhook.url,
			events: webhook.events,
			secret, // Only returned at creation
			isActive: webhook.isActive,
			createdAt: webhook.createdAt.toISOString()
		};

		await completeApiRequest(auth.context, event, 201);
		return apiSuccess(data, undefined, getRateLimitInfo(auth.context), 201);
	} catch (error) {
		console.error('API v1 webhook create error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
