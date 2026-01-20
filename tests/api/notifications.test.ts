import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock notification service
vi.mock('$lib/server/services/notification', () => ({
	getUserNotifications: vi.fn(),
	getUnreadCount: vi.fn(),
	markAllAsRead: vi.fn(),
	markAsRead: vi.fn(),
	deleteNotification: vi.fn(),
	getNotificationPreferences: vi.fn(),
	updateNotificationPreference: vi.fn(),
	NotificationError: class NotificationError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock email notification service
vi.mock('$lib/server/services/emailNotification', () => ({
	processUnsubscribe: vi.fn(),
	unsubscribeFromAll: vi.fn()
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body),
		signal: {
			addEventListener: vi.fn()
		}
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(path: string, params: Record<string, string> = {}): URL {
	const url = new URL(`http://localhost:3000${path}`);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T25: Notification & Moderation API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/notifications', () => {
		it('should return user notifications', async () => {
			const { getUserNotifications, getUnreadCount } = await import(
				'$lib/server/services/notification'
			);
			const { GET } = await import('../../src/routes/api/notifications/+server');

			vi.mocked(getUserNotifications).mockResolvedValue([
				{
					id: 'notif-1',
					type: 'FACT_REPLY',
					message: 'Someone replied to your fact',
					read: false,
					createdAt: new Date()
				},
				{
					id: 'notif-2',
					type: 'TRUST_GAINED',
					message: 'You gained trust points',
					read: true,
					createdAt: new Date()
				}
			] as any);
			vi.mocked(getUnreadCount).mockResolvedValue(1);

			const url = createMockUrl('/api/notifications');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.notifications).toHaveLength(2);
			expect(data.data.unreadCount).toBe(1);
		});

		it('should return unread only when requested', async () => {
			const { getUserNotifications, getUnreadCount } = await import(
				'$lib/server/services/notification'
			);
			const { GET } = await import('../../src/routes/api/notifications/+server');

			vi.mocked(getUserNotifications).mockResolvedValue([]);
			vi.mocked(getUnreadCount).mockResolvedValue(0);

			const url = createMockUrl('/api/notifications', { unread: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await GET({ url, locals } as any);

			expect(getUserNotifications).toHaveBeenCalledWith('user-123', {
				unreadOnly: true,
				limit: 20,
				offset: 0
			});
		});

		it('should apply pagination', async () => {
			const { getUserNotifications, getUnreadCount } = await import(
				'$lib/server/services/notification'
			);
			const { GET } = await import('../../src/routes/api/notifications/+server');

			vi.mocked(getUserNotifications).mockResolvedValue([]);
			vi.mocked(getUnreadCount).mockResolvedValue(0);

			const url = createMockUrl('/api/notifications', { limit: '10', offset: '20' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await GET({ url, locals } as any);

			expect(getUserNotifications).toHaveBeenCalledWith('user-123', {
				unreadOnly: false,
				limit: 10,
				offset: 20
			});
		});

		it('should return count only when requested', async () => {
			const { getUnreadCount } = await import('$lib/server/services/notification');
			const { GET } = await import('../../src/routes/api/notifications/+server');

			vi.mocked(getUnreadCount).mockResolvedValue(5);

			const url = createMockUrl('/api/notifications', { count: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.unreadCount).toBe(5);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/notifications/+server');

			const url = createMockUrl('/api/notifications');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/notifications', () => {
		it('should mark all as read', async () => {
			const { markAllAsRead } = await import('$lib/server/services/notification');
			const { POST } = await import('../../src/routes/api/notifications/+server');

			vi.mocked(markAllAsRead).mockResolvedValue(5);

			const request = createMockRequest({ action: 'mark_all_read' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.markedRead).toBe(5);
		});

		it('should throw 400 for invalid action', async () => {
			const { POST } = await import('../../src/routes/api/notifications/+server');

			const request = createMockRequest({ action: 'invalid' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/notifications/+server');

			const request = createMockRequest({ action: 'mark_all_read' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('PATCH /api/notifications/:id', () => {
		it('should mark notification as read', async () => {
			const { markAsRead } = await import('$lib/server/services/notification');
			const { PATCH } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(markAsRead).mockResolvedValue({
				id: 'notif-123',
				read: true
			} as any);

			const params = { id: 'notif-123' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await PATCH({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.read).toBe(true);
		});

		it('should throw 404 when notification not found', async () => {
			const { markAsRead, NotificationError } = await import(
				'$lib/server/services/notification'
			);
			const { PATCH } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(markAsRead).mockRejectedValue(
				new NotificationError('NOT_FOUND', 'Notification not found')
			);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 403 when unauthorized', async () => {
			const { markAsRead, NotificationError } = await import(
				'$lib/server/services/notification'
			);
			const { PATCH } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(markAsRead).mockRejectedValue(
				new NotificationError('UNAUTHORIZED', 'Not your notification')
			);

			const params = { id: 'notif-456' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/notifications/[id]/+server');

			const params = { id: 'notif-123' };
			const locals = { user: null };

			await expect(PATCH({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('DELETE /api/notifications/:id', () => {
		it('should delete notification', async () => {
			const { deleteNotification } = await import('$lib/server/services/notification');
			const { DELETE } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(deleteNotification).mockResolvedValue(undefined);

			const params = { id: 'notif-123' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('deleted');
		});

		it('should throw 404 when notification not found', async () => {
			const { deleteNotification, NotificationError } = await import(
				'$lib/server/services/notification'
			);
			const { DELETE } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(deleteNotification).mockRejectedValue(
				new NotificationError('NOT_FOUND', 'Notification not found')
			);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 403 when unauthorized', async () => {
			const { deleteNotification, NotificationError } = await import(
				'$lib/server/services/notification'
			);
			const { DELETE } = await import('../../src/routes/api/notifications/[id]/+server');

			vi.mocked(deleteNotification).mockRejectedValue(
				new NotificationError('UNAUTHORIZED', 'Not your notification')
			);

			const params = { id: 'notif-456' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/notifications/[id]/+server');

			const params = { id: 'notif-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('GET /api/notifications/preferences', () => {
		it('should return notification preferences', async () => {
			const { getNotificationPreferences } = await import('$lib/server/services/notification');
			const { GET } = await import('../../src/routes/api/notifications/preferences/+server');

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'FACT_REPLY', email: true, inApp: true },
				{ type: 'TRUST_GAINED', email: false, inApp: true },
				{ type: 'DEBATE_REQUEST', email: true, inApp: true }
			] as any);

			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(3);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/notifications/preferences/+server');

			const locals = { user: null };

			await expect(GET({ locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('PATCH /api/notifications/preferences', () => {
		it('should update email preference', async () => {
			const { updateNotificationPreference } = await import(
				'$lib/server/services/notification'
			);
			const { PATCH } = await import('../../src/routes/api/notifications/preferences/+server');

			vi.mocked(updateNotificationPreference).mockResolvedValue({
				type: 'FACT_REPLY',
				email: false,
				inApp: true
			} as any);

			const request = createMockRequest({ type: 'FACT_REPLY', email: false });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.email).toBe(false);
		});

		it('should update inApp preference', async () => {
			const { updateNotificationPreference } = await import(
				'$lib/server/services/notification'
			);
			const { PATCH } = await import('../../src/routes/api/notifications/preferences/+server');

			vi.mocked(updateNotificationPreference).mockResolvedValue({
				type: 'TRUST_GAINED',
				email: true,
				inApp: false
			} as any);

			const request = createMockRequest({ type: 'TRUST_GAINED', inApp: false });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.inApp).toBe(false);
		});

		it('should throw 400 for invalid type', async () => {
			const { PATCH } = await import('../../src/routes/api/notifications/preferences/+server');

			const request = createMockRequest({ type: 'INVALID_TYPE', email: false });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 when neither email nor inApp specified', async () => {
			const { PATCH } = await import('../../src/routes/api/notifications/preferences/+server');

			const request = createMockRequest({ type: 'FACT_REPLY' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/notifications/preferences/+server');

			const request = createMockRequest({ type: 'FACT_REPLY', email: false });
			const locals = { user: null };

			await expect(PATCH({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('GET /api/notifications/stream', () => {
		it('should return SSE response for authenticated user', async () => {
			const { getUnreadCount } = await import('$lib/server/services/notification');
			const { GET } = await import('../../src/routes/api/notifications/stream/+server');

			vi.mocked(getUnreadCount).mockResolvedValue(3);

			const request = {
				signal: {
					addEventListener: vi.fn()
				}
			};
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ locals, request } as any);

			expect(response).toBeInstanceOf(Response);
			expect(response.headers.get('Content-Type')).toBe('text/event-stream');
			expect(response.headers.get('Cache-Control')).toBe('no-cache');
		});

		it('should return 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/notifications/stream/+server');

			const request = {
				signal: {
					addEventListener: vi.fn()
				}
			};
			const locals = { user: null };

			const response = await GET({ locals, request } as any);

			expect(response.status).toBe(401);
		});
	});

	describe('GET /api/notifications/unsubscribe', () => {
		it('should unsubscribe from specific type', async () => {
			const { processUnsubscribe } = await import('$lib/server/services/emailNotification');
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			vi.mocked(processUnsubscribe).mockResolvedValue(true);

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				type: 'FACT_REPLY',
				token: 'valid-token'
			});

			const response = await GET({ url } as any);

			expect(response).toBeInstanceOf(Response);
			expect(response.headers.get('Content-Type')).toBe('text/html');

			const html = await response.text();
			expect(html).toContain('Unsubscribed');
			expect(html).toContain('fact reply');
		});

		it('should unsubscribe from all notifications', async () => {
			const { processUnsubscribe, unsubscribeFromAll } = await import(
				'$lib/server/services/emailNotification'
			);
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			vi.mocked(processUnsubscribe).mockResolvedValue(true);
			vi.mocked(unsubscribeFromAll).mockResolvedValue(undefined);

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				type: 'FACT_REPLY',
				token: 'valid-token',
				all: 'true'
			});

			const response = await GET({ url } as any);

			expect(response).toBeInstanceOf(Response);
			const html = await response.text();
			expect(html).toContain('all email notifications');
			expect(unsubscribeFromAll).toHaveBeenCalledWith('user-123');
		});

		it('should throw 400 when userId missing', async () => {
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			const url = createMockUrl('/api/notifications/unsubscribe', {
				type: 'FACT_REPLY',
				token: 'valid-token'
			});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 when token missing', async () => {
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				type: 'FACT_REPLY'
			});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 for invalid notification type', async () => {
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				type: 'INVALID_TYPE',
				token: 'valid-token'
			});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 for invalid token', async () => {
			const { processUnsubscribe } = await import('$lib/server/services/emailNotification');
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			vi.mocked(processUnsubscribe).mockResolvedValue(false);

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				type: 'FACT_REPLY',
				token: 'invalid-token'
			});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 for invalid token on unsubscribe all', async () => {
			const { processUnsubscribe } = await import('$lib/server/services/emailNotification');
			const { GET } = await import('../../src/routes/api/notifications/unsubscribe/+server');

			vi.mocked(processUnsubscribe).mockResolvedValue(false);

			const url = createMockUrl('/api/notifications/unsubscribe', {
				userId: 'user-123',
				token: 'invalid-token',
				all: 'true'
			});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});
	});
});
