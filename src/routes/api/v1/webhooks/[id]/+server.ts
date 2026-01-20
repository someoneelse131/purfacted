/**
 * Public API v1 - Single Webhook Endpoint
 *
 * GET /api/v1/webhooks/:id - Get webhook details and delivery logs
 * PATCH /api/v1/webhooks/:id - Update webhook
 * DELETE /api/v1/webhooks/:id - Delete webhook
 */

import type { RequestHandler } from './$types';
import { authenticateApiRequest, completeApiRequest, getRateLimitInfo } from '$lib/server/api/middleware';
import { apiSuccess, apiError, API_ERRORS } from '$lib/server/api/response';
import {
	getWebhookById,
	updateWebhook,
	deleteWebhook,
	getWebhookDeliveryLogs,
	WEBHOOK_EVENTS
} from '$lib/server/services/webhook';
import type { WebhookEvent } from '$lib/server/services/webhook';

export const GET: RequestHandler = async (event) => {
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const { id } = event.params;

		const webhook = await getWebhookById(id);

		if (!webhook) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		// Verify ownership
		if (webhook.apiKeyId !== auth.context.apiKey.id) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		// Get recent delivery logs
		const deliveryLogs = await getWebhookDeliveryLogs(id, 10);

		const data = {
			id: webhook.id,
			url: webhook.url,
			events: webhook.events,
			isActive: webhook.isActive,
			createdAt: webhook.createdAt.toISOString(),
			updatedAt: webhook.updatedAt.toISOString(),
			recentDeliveries: deliveryLogs.map((log) => ({
				id: log.id,
				event: log.event,
				status: log.status,
				attempts: log.attempts,
				deliveredAt: log.deliveredAt?.toISOString() || null,
				createdAt: log.createdAt.toISOString()
			}))
		};

		await completeApiRequest(auth.context, event, 200);
		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 webhook detail error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};

export const PATCH: RequestHandler = async (event) => {
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const { id } = event.params;

		const webhook = await getWebhookById(id);

		if (!webhook) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		// Verify ownership
		if (webhook.apiKeyId !== auth.context.apiKey.id) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		const body = await event.request.json();
		const { url, events, isActive } = body;

		const updateData: { url?: string; events?: WebhookEvent[]; isActive?: boolean } = {};

		// Validate and set URL
		if (url !== undefined) {
			if (typeof url !== 'string') {
				await completeApiRequest(auth.context, event, 400);
				return apiError('INVALID_URL', 'Invalid URL format', 400);
			}
			try {
				new URL(url);
				updateData.url = url;
			} catch {
				await completeApiRequest(auth.context, event, 400);
				return apiError('INVALID_URL', 'Invalid webhook URL format', 400);
			}
		}

		// Validate and set events
		if (events !== undefined) {
			if (!Array.isArray(events) || events.length === 0) {
				await completeApiRequest(auth.context, event, 400);
				return apiError('INVALID_EVENTS', 'At least one event is required', 400);
			}

			const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
			if (invalidEvents.length > 0) {
				await completeApiRequest(auth.context, event, 400);
				return apiError(
					'INVALID_EVENTS',
					`Invalid events: ${invalidEvents.join(', ')}`,
					400
				);
			}

			updateData.events = events as WebhookEvent[];
		}

		// Validate and set isActive
		if (isActive !== undefined) {
			if (typeof isActive !== 'boolean') {
				await completeApiRequest(auth.context, event, 400);
				return apiError('INVALID_INPUT', 'isActive must be a boolean', 400);
			}
			updateData.isActive = isActive;
		}

		// Update webhook
		const updated = await updateWebhook(id, updateData);

		const data = {
			id: updated.id,
			url: updated.url,
			events: updated.events,
			isActive: updated.isActive,
			createdAt: updated.createdAt.toISOString(),
			updatedAt: updated.updatedAt.toISOString()
		};

		await completeApiRequest(auth.context, event, 200);
		return apiSuccess(data, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 webhook update error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await authenticateApiRequest(event);
	if (!auth.success) {
		return auth.response;
	}

	try {
		const { id } = event.params;

		const webhook = await getWebhookById(id);

		if (!webhook) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		// Verify ownership
		if (webhook.apiKeyId !== auth.context.apiKey.id) {
			await completeApiRequest(auth.context, event, 404);
			return API_ERRORS.NOT_FOUND('Webhook');
		}

		await deleteWebhook(id);

		await completeApiRequest(auth.context, event, 200);
		return apiSuccess({ deleted: true }, undefined, getRateLimitInfo(auth.context));
	} catch (error) {
		console.error('API v1 webhook delete error:', error);
		await completeApiRequest(auth.context, event, 500);
		return API_ERRORS.INTERNAL_ERROR();
	}
};
