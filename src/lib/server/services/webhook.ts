/**
 * Webhook Service
 *
 * Handles webhook registration, delivery, and retry logic
 * for notifying external services of fact status changes.
 */

import { db } from '$lib/server/db';
import crypto from 'crypto';

// Supported webhook events
export const WEBHOOK_EVENTS = [
	'fact.created',
	'fact.status_changed',
	'fact.updated',
	'fact.voted',
	'source.added',
	'veto.created',
	'veto.resolved'
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// Webhook payload structure
export interface WebhookPayload {
	event: WebhookEvent;
	timestamp: string;
	data: Record<string, unknown>;
}

/**
 * Generate a webhook signing secret
 */
export function generateWebhookSecret(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Sign a webhook payload with HMAC-SHA256
 */
export function signWebhookPayload(payload: string, secret: string): string {
	return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Create a new webhook subscription
 */
export async function createWebhook(data: {
	apiKeyId: string;
	url: string;
	events: WebhookEvent[];
}): Promise<{ webhook: typeof db.webhook.$inferSelect; secret: string }> {
	const secret = generateWebhookSecret();

	const webhook = await db.webhook.create({
		data: {
			apiKeyId: data.apiKeyId,
			url: data.url,
			events: data.events,
			secret,
			isActive: true
		}
	});

	return { webhook, secret };
}

/**
 * Get webhooks by API key
 */
export async function getWebhooksByApiKey(apiKeyId: string) {
	return db.webhook.findMany({
		where: { apiKeyId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get a webhook by ID
 */
export async function getWebhookById(webhookId: string) {
	return db.webhook.findUnique({
		where: { id: webhookId }
	});
}

/**
 * Update webhook subscription
 */
export async function updateWebhook(
	webhookId: string,
	data: { url?: string; events?: WebhookEvent[]; isActive?: boolean }
) {
	return db.webhook.update({
		where: { id: webhookId },
		data
	});
}

/**
 * Delete a webhook subscription
 */
export async function deleteWebhook(webhookId: string) {
	return db.webhook.delete({
		where: { id: webhookId }
	});
}

/**
 * Dispatch an event to all registered webhooks
 */
export async function dispatchWebhookEvent(
	event: WebhookEvent,
	data: Record<string, unknown>
): Promise<void> {
	// Find all active webhooks subscribed to this event
	const webhooks = await db.webhook.findMany({
		where: {
			isActive: true,
			events: { has: event }
		}
	});

	if (webhooks.length === 0) {
		return;
	}

	const payload: WebhookPayload = {
		event,
		timestamp: new Date().toISOString(),
		data
	};

	// Dispatch to each webhook (fire and forget for now)
	for (const webhook of webhooks) {
		deliverWebhook(webhook.id, webhook.url, webhook.secret, payload).catch((error) => {
			console.error(`Webhook delivery failed for ${webhook.id}:`, error);
		});
	}
}

/**
 * Deliver a webhook payload to an endpoint
 */
async function deliverWebhook(
	webhookId: string,
	url: string,
	secret: string,
	payload: WebhookPayload,
	attempt: number = 1
): Promise<void> {
	const payloadString = JSON.stringify(payload);
	const signature = signWebhookPayload(payloadString, secret);

	const maxAttempts = 3;
	let status = 0;
	let responseBody = '';
	let deliveredAt: Date | null = null;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Webhook-Signature': signature,
				'X-Webhook-Event': payload.event,
				'X-Webhook-Timestamp': payload.timestamp,
				'User-Agent': 'PurFacted-Webhook/1.0'
			},
			body: payloadString,
			signal: AbortSignal.timeout(10000) // 10 second timeout
		});

		status = response.status;
		responseBody = await response.text().catch(() => '');

		if (response.ok) {
			deliveredAt = new Date();
		}
	} catch (error: any) {
		status = 0;
		responseBody = error.message || 'Network error';
	}

	// Log the delivery attempt
	await db.webhookDelivery.create({
		data: {
			webhookId,
			event: payload.event,
			payload: payload as any,
			status,
			response: responseBody.substring(0, 500), // Truncate response
			attempts: attempt,
			deliveredAt
		}
	});

	// Retry if failed and under max attempts
	if (!deliveredAt && attempt < maxAttempts) {
		const retryDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
		setTimeout(() => {
			deliverWebhook(webhookId, url, secret, payload, attempt + 1);
		}, retryDelay);
	}
}

/**
 * Get recent webhook delivery logs
 */
export async function getWebhookDeliveryLogs(webhookId: string, limit: number = 20) {
	return db.webhookDelivery.findMany({
		where: { webhookId },
		orderBy: { createdAt: 'desc' },
		take: limit
	});
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string
): boolean {
	const expectedSignature = signWebhookPayload(payload, secret);
	return crypto.timingSafeEqual(
		Buffer.from(signature),
		Buffer.from(expectedSignature)
	);
}

// Convenience functions for specific events

/**
 * Dispatch event when a fact is created
 */
export async function dispatchFactCreated(fact: {
	id: string;
	title: string;
	status: string;
	categoryId?: string | null;
}) {
	await dispatchWebhookEvent('fact.created', {
		factId: fact.id,
		title: fact.title,
		status: fact.status,
		categoryId: fact.categoryId
	});
}

/**
 * Dispatch event when a fact status changes
 */
export async function dispatchFactStatusChanged(fact: {
	id: string;
	title: string;
	previousStatus: string;
	newStatus: string;
}) {
	await dispatchWebhookEvent('fact.status_changed', {
		factId: fact.id,
		title: fact.title,
		previousStatus: fact.previousStatus,
		newStatus: fact.newStatus
	});
}

/**
 * Dispatch event when a fact receives a vote
 */
export async function dispatchFactVoted(data: {
	factId: string;
	voteValue: number;
	totalVotes: number;
	weightedScore: number;
}) {
	await dispatchWebhookEvent('fact.voted', data);
}

/**
 * Dispatch event when a source is added
 */
export async function dispatchSourceAdded(source: {
	id: string;
	factId: string;
	url: string;
	type: string;
	credibility: number;
}) {
	await dispatchWebhookEvent('source.added', source);
}

/**
 * Dispatch event when a veto is created
 */
export async function dispatchVetoCreated(veto: {
	id: string;
	factId: string;
	reason: string;
}) {
	await dispatchWebhookEvent('veto.created', veto);
}

/**
 * Dispatch event when a veto is resolved
 */
export async function dispatchVetoResolved(veto: {
	id: string;
	factId: string;
	status: string;
	newFactStatus?: string;
}) {
	await dispatchWebhookEvent('veto.resolved', veto);
}
