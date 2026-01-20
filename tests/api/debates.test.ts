import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock debate service
vi.mock('$lib/server/services/debate', () => ({
	initiateDebate: vi.fn(),
	getUserDebates: vi.fn(),
	getDebateById: vi.fn(),
	acceptDebate: vi.fn(),
	declineDebate: vi.fn(),
	sendMessage: vi.fn(),
	getDebateMessages: vi.fn(),
	canUserAccessDebate: vi.fn(),
	requestPublish: vi.fn(),
	acceptPublish: vi.fn(),
	voteOnDebate: vi.fn(),
	getUserDebateVote: vi.fn(),
	getDebateVotingSummary: vi.fn(),
	getRetentionNotice: vi.fn(() => 'Debates are retained for 90 days'),
	DebateError: class DebateError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
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

describe('T19: Debates API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/debates', () => {
		it('should return user debates', async () => {
			const { getUserDebates } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/+server');

			vi.mocked(getUserDebates).mockResolvedValue({
				debates: [
					{
						id: 'debate-1',
						fact: { id: 'fact-1', title: 'Climate Change' },
						initiator: { id: 'user-1', username: 'alice' },
						participant: { id: 'user-2', username: 'bob' },
						title: 'Climate Discussion',
						status: 'ACTIVE',
						_count: { messages: 10, votes: 5 },
						publishedAt: null,
						createdAt: new Date(),
						updatedAt: new Date()
					}
				],
				total: 1
			} as any);

			const url = createMockUrl('/api/debates');
			const locals = { user: { id: 'user-1' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.debates).toHaveLength(1);
			expect(data.data.debates[0].status).toBe('ACTIVE');
			expect(data.data.retentionNotice).toBeDefined();
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/debates/+server');

			const url = createMockUrl('/api/debates');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should filter by status', async () => {
			const { getUserDebates } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/+server');

			vi.mocked(getUserDebates).mockResolvedValue({
				debates: [],
				total: 0
			} as any);

			const url = createMockUrl('/api/debates', { status: 'PUBLISHED' });
			const locals = { user: { id: 'user-1' } };

			await GET({ url, locals } as any);

			expect(getUserDebates).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					status: 'PUBLISHED'
				})
			);
		});
	});

	describe('POST /api/debates', () => {
		it('should initiate debate for authenticated verified user', async () => {
			const { initiateDebate } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/+server');

			vi.mocked(initiateDebate).mockResolvedValue({
				id: 'debate-123',
				status: 'PENDING'
			} as any);

			const request = createMockRequest({
				factId: 'fact-123',
				participantId: 'user-456'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('debate-123');
			expect(data.data.status).toBe('PENDING');
			expect(data.data.message).toContain('invitation');
			expect(initiateDebate).toHaveBeenCalledWith('user-123', {
				factId: 'fact-123',
				participantId: 'user-456'
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/debates/+server');

			const request = createMockRequest({
				factId: 'fact-123',
				participantId: 'user-456'
			});
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/debates/+server');

			const request = createMockRequest({
				factId: 'fact-123',
				participantId: 'user-456'
			});
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when fact not found', async () => {
			const { initiateDebate, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/+server');

			vi.mocked(initiateDebate).mockRejectedValue(
				new DebateError('FACT_NOT_FOUND', 'Fact not found')
			);

			const request = createMockRequest({
				factId: 'nonexistent',
				participantId: 'user-456'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when debate already exists', async () => {
			const { initiateDebate, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/+server');

			vi.mocked(initiateDebate).mockRejectedValue(
				new DebateError('DEBATE_EXISTS', 'Debate already exists')
			);

			const request = createMockRequest({
				factId: 'fact-123',
				participantId: 'user-456'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});

	describe('GET /api/debates/:id', () => {
		it('should return debate details for participant', async () => {
			const { getDebateById, canUserAccessDebate } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(getDebateById).mockResolvedValue({
				id: 'debate-123',
				fact: { id: 'fact-123', title: 'Climate Change' },
				initiator: { id: 'user-1', username: 'alice' },
				participant: { id: 'user-2', username: 'bob' },
				title: null,
				status: 'ACTIVE',
				_count: { messages: 15, votes: 0 },
				publishedAt: null,
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
			vi.mocked(canUserAccessDebate).mockResolvedValue(true);

			const params = { id: 'debate-123' };
			const locals = { user: { id: 'user-1' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('debate-123');
			expect(data.data.messageCount).toBe(15);
		});

		it('should throw 404 when debate not found', async () => {
			const { getDebateById } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(getDebateById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'user-1' } };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 403 when user has no access', async () => {
			const { getDebateById, canUserAccessDebate } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(getDebateById).mockResolvedValue({
				id: 'debate-123',
				status: 'ACTIVE'
			} as any);
			vi.mocked(canUserAccessDebate).mockResolvedValue(false);

			const params = { id: 'debate-123' };
			const locals = { user: { id: 'other-user' } };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('PATCH /api/debates/:id', () => {
		it('should accept debate invitation', async () => {
			const { acceptDebate } = await import('$lib/server/services/debate');
			const { PATCH } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(acceptDebate).mockResolvedValue({
				id: 'debate-123',
				status: 'ACTIVE'
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ action: 'accept' });
			const locals = { user: { id: 'user-456' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('ACTIVE');
			expect(data.data.message).toContain('accepted');
		});

		it('should decline debate invitation', async () => {
			const { declineDebate } = await import('$lib/server/services/debate');
			const { PATCH } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(declineDebate).mockResolvedValue({
				id: 'debate-123',
				status: 'DECLINED'
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ action: 'decline' });
			const locals = { user: { id: 'user-456' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('DECLINED');
			expect(data.data.message).toContain('declined');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/debates/[id]/+server');

			const params = { id: 'debate-123' };
			const request = createMockRequest({ action: 'accept' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when not participant', async () => {
			const { acceptDebate, DebateError } = await import('$lib/server/services/debate');
			const { PATCH } = await import('../../src/routes/api/debates/[id]/+server');

			vi.mocked(acceptDebate).mockRejectedValue(
				new DebateError('NOT_PARTICIPANT', 'Not a participant')
			);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ action: 'accept' });
			const locals = { user: { id: 'other-user' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/debates/:id/messages', () => {
		it('should return debate messages for participant', async () => {
			const { canUserAccessDebate, getDebateMessages } = await import(
				'$lib/server/services/debate'
			);
			const { GET } = await import('../../src/routes/api/debates/[id]/messages/+server');

			vi.mocked(canUserAccessDebate).mockResolvedValue(true);
			vi.mocked(getDebateMessages).mockResolvedValue({
				messages: [
					{
						id: 'msg-1',
						body: 'Hello',
						user: { id: 'user-1', username: 'alice' },
						createdAt: new Date()
					},
					{
						id: 'msg-2',
						body: 'Hi there',
						user: { id: 'user-2', username: 'bob' },
						createdAt: new Date()
					}
				],
				total: 2
			} as any);

			const params = { id: 'debate-123' };
			const url = createMockUrl('/api/debates/debate-123/messages');
			const locals = { user: { id: 'user-1' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.messages).toHaveLength(2);
		});

		it('should throw 403 when user has no access', async () => {
			const { canUserAccessDebate } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/[id]/messages/+server');

			vi.mocked(canUserAccessDebate).mockResolvedValue(false);

			const params = { id: 'debate-123' };
			const url = createMockUrl('/api/debates/debate-123/messages');
			const locals = { user: { id: 'other-user' } };

			await expect(GET({ params, url, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('POST /api/debates/:id/messages', () => {
		it('should send message in debate', async () => {
			const { sendMessage } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/messages/+server');

			vi.mocked(sendMessage).mockResolvedValue({
				id: 'msg-123',
				body: 'My message',
				createdAt: new Date()
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ body: 'My message' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('msg-123');
			expect(data.data.body).toBe('My message');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/debates/[id]/messages/+server');

			const params = { id: 'debate-123' };
			const request = createMockRequest({ body: 'Message' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when not in debate', async () => {
			const { sendMessage, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/messages/+server');

			vi.mocked(sendMessage).mockRejectedValue(
				new DebateError('NOT_IN_DEBATE', 'Not a participant')
			);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ body: 'Message' });
			const locals = { user: { id: 'other-user', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 429 for duplicate message', async () => {
			const { sendMessage, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/messages/+server');

			vi.mocked(sendMessage).mockRejectedValue(
				new DebateError('DUPLICATE_MESSAGE', 'Please wait before sending another message')
			);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ body: 'Message' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 429
			});
		});
	});

	describe('POST /api/debates/:id/publish', () => {
		it('should request publish with title', async () => {
			const { requestPublish } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/publish/+server');

			vi.mocked(requestPublish).mockResolvedValue({
				id: 'debate-123',
				title: 'Great Debate'
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ title: 'Great Debate' });
			const locals = { user: { id: 'user-123' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.title).toBe('Great Debate');
			expect(data.data.message).toContain('request sent');
		});

		it('should accept publish request', async () => {
			const { acceptPublish } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/publish/+server');

			vi.mocked(acceptPublish).mockResolvedValue({
				id: 'debate-123',
				status: 'PUBLISHED',
				publishedAt: new Date()
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ action: 'accept' });
			const locals = { user: { id: 'user-456' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('PUBLISHED');
			expect(data.data.message).toContain('published');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/debates/[id]/publish/+server');

			const params = { id: 'debate-123' };
			const request = createMockRequest({ title: 'Title' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when not in debate', async () => {
			const { requestPublish, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/publish/+server');

			vi.mocked(requestPublish).mockRejectedValue(
				new DebateError('NOT_IN_DEBATE', 'Not a participant')
			);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ title: 'Title' });
			const locals = { user: { id: 'other-user' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/debates/:id/vote', () => {
		it('should return voting summary and user vote', async () => {
			const { getDebateVotingSummary, getUserDebateVote } = await import(
				'$lib/server/services/debate'
			);
			const { GET } = await import('../../src/routes/api/debates/[id]/vote/+server');

			vi.mocked(getDebateVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);
			vi.mocked(getUserDebateVote).mockResolvedValue({
				value: 1,
				weight: 2.4
			} as any);

			const params = { id: 'debate-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.summary.upvotes).toBe(10);
			expect(data.data.userVote.value).toBe(1);
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getDebateVotingSummary } = await import('$lib/server/services/debate');
			const { GET } = await import('../../src/routes/api/debates/[id]/vote/+server');

			vi.mocked(getDebateVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);

			const params = { id: 'debate-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});
	});

	describe('POST /api/debates/:id/vote', () => {
		it('should record vote on published debate', async () => {
			const { voteOnDebate } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/vote/+server');

			vi.mocked(voteOnDebate).mockResolvedValue({
				vote: { value: 1, weight: 2.4 },
				votingSummary: { upvotes: 11, downvotes: 3 }
			} as any);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(1);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/debates/[id]/vote/+server');

			const params = { id: 'debate-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 400 when debate is not published', async () => {
			const { voteOnDebate, DebateError } = await import('$lib/server/services/debate');
			const { POST } = await import('../../src/routes/api/debates/[id]/vote/+server');

			vi.mocked(voteOnDebate).mockRejectedValue(
				new DebateError('NOT_PUBLISHED', 'Debate is not published')
			);

			const params = { id: 'debate-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});
	});
});
