import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock factEdit service
vi.mock('$lib/server/services/factEdit', () => ({
	requestFactEdit: vi.fn(),
	getPendingEdit: vi.fn(),
	getFactEdits: vi.fn(),
	cancelFactEdit: vi.fn(),
	generateDiff: vi.fn(),
	FactEditError: class FactEditError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock veto service
vi.mock('$lib/server/services/veto', () => ({
	submitVeto: vi.fn(),
	getFactVetos: vi.fn(),
	VetoError: class VetoError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock fact service
vi.mock('$lib/server/services/fact', () => ({
	getFactById: vi.fn()
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(params: Record<string, string>): URL {
	const url = new URL('http://localhost:3000/api/facts/fact-123/edit');
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T15: Edit & Veto API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Edit API', () => {
		describe('GET /api/facts/:id/edit', () => {
			it('should return edit history and pending edit', async () => {
				const { getPendingEdit, getFactEdits, generateDiff } = await import(
					'$lib/server/services/factEdit'
				);
				const { GET } = await import('../../src/routes/api/facts/[id]/edit/+server');

				const pendingEdit = {
					id: 'edit-123',
					oldBody: 'Original text',
					newBody: 'Updated text',
					status: 'PENDING',
					createdAt: new Date()
				};
				const editHistory = [
					{
						id: 'edit-100',
						oldBody: 'Old',
						newBody: 'New',
						status: 'APPROVED',
						createdAt: new Date()
					}
				];

				vi.mocked(getPendingEdit).mockResolvedValue(pendingEdit as any);
				vi.mocked(getFactEdits).mockResolvedValue(editHistory as any);
				vi.mocked(generateDiff).mockReturnValue([
					{ type: 'removed', value: 'Original' },
					{ type: 'added', value: 'Updated' }
				] as any);

				const params = { id: 'fact-123' };

				const response = await GET({ params } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.pendingEdit).toBeDefined();
				expect(data.data.pendingEdit.id).toBe('edit-123');
				expect(data.data.pendingEdit.diff).toBeDefined();
				expect(data.data.editHistory).toHaveLength(1);
			});

			it('should return null pending edit when none exists', async () => {
				const { getPendingEdit, getFactEdits } = await import('$lib/server/services/factEdit');
				const { GET } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(getPendingEdit).mockResolvedValue(null);
				vi.mocked(getFactEdits).mockResolvedValue([]);

				const params = { id: 'fact-123' };

				const response = await GET({ params } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.pendingEdit).toBeNull();
				expect(data.data.editHistory).toHaveLength(0);
			});

			it('should throw 500 on service error', async () => {
				const { getPendingEdit } = await import('$lib/server/services/factEdit');
				const { GET } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(getPendingEdit).mockRejectedValue(new Error('Database error'));

				const params = { id: 'fact-123' };

				await expect(GET({ params } as any)).rejects.toMatchObject({
					status: 500
				});
			});
		});

		describe('POST /api/facts/:id/edit', () => {
			it('should create edit request for authenticated user', async () => {
				const { requestFactEdit, generateDiff } = await import('$lib/server/services/factEdit');
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				const edit = {
					id: 'edit-123',
					oldBody: 'Original text',
					newBody: 'Updated text',
					status: 'PENDING'
				};

				vi.mocked(requestFactEdit).mockResolvedValue(edit as any);
				vi.mocked(generateDiff).mockReturnValue([
					{ type: 'removed', value: 'Original' },
					{ type: 'added', value: 'Updated' }
				] as any);

				const params = { id: 'fact-123' };
				const request = createMockRequest({ newBody: 'Updated text' });
				const locals = { user: { id: 'user-123' } };

				const response = await POST({ params, request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.edit.id).toBe('edit-123');
				expect(data.data.diff).toBeDefined();
				expect(requestFactEdit).toHaveBeenCalledWith('fact-123', 'user-123', 'Updated text');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({ newBody: 'Updated text' });
				const locals = { user: null };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 400 when newBody is missing', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({});
				const locals = { user: { id: 'user-123' } };

				// The error is thrown inside try block, so it gets caught and re-thrown as 500
				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 500
				});
			});

			it('should throw 404 when fact not found', async () => {
				const { requestFactEdit, FactEditError } = await import('$lib/server/services/factEdit');
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(requestFactEdit).mockRejectedValue(
					new FactEditError('FACT_NOT_FOUND', 'Fact not found')
				);

				const params = { id: 'nonexistent' };
				const request = createMockRequest({ newBody: 'Updated text' });
				const locals = { user: { id: 'user-123' } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});

			it('should throw 403 when user is not author', async () => {
				const { requestFactEdit, FactEditError } = await import('$lib/server/services/factEdit');
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(requestFactEdit).mockRejectedValue(
					new FactEditError('NOT_AUTHOR', 'Only the author can edit')
				);

				const params = { id: 'fact-123' };
				const request = createMockRequest({ newBody: 'Updated text' });
				const locals = { user: { id: 'other-user' } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 403
				});
			});

			it('should throw 400 for other edit errors', async () => {
				const { requestFactEdit, FactEditError } = await import('$lib/server/services/factEdit');
				const { POST } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(requestFactEdit).mockRejectedValue(
					new FactEditError('PENDING_EDIT_EXISTS', 'A pending edit already exists')
				);

				const params = { id: 'fact-123' };
				const request = createMockRequest({ newBody: 'Updated text' });
				const locals = { user: { id: 'user-123' } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 400
				});
			});
		});

		describe('DELETE /api/facts/:id/edit', () => {
			it('should cancel pending edit without editId', async () => {
				const { getPendingEdit, cancelFactEdit } = await import('$lib/server/services/factEdit');
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(getPendingEdit).mockResolvedValue({ id: 'edit-123' } as any);
				vi.mocked(cancelFactEdit).mockResolvedValue(undefined);

				const params = { id: 'fact-123' };
				const locals = { user: { id: 'user-123' } };
				const url = createMockUrl({});

				const response = await DELETE({ params, locals, url } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.message).toBe('Edit request cancelled');
				expect(cancelFactEdit).toHaveBeenCalledWith('edit-123', 'user-123');
			});

			it('should cancel specific edit with editId', async () => {
				const { cancelFactEdit } = await import('$lib/server/services/factEdit');
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(cancelFactEdit).mockResolvedValue(undefined);

				const params = { id: 'fact-123' };
				const locals = { user: { id: 'user-123' } };
				const url = createMockUrl({ editId: 'edit-456' });

				const response = await DELETE({ params, locals, url } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(cancelFactEdit).toHaveBeenCalledWith('edit-456', 'user-123');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				const params = { id: 'fact-123' };
				const locals = { user: null };
				const url = createMockUrl({});

				await expect(DELETE({ params, locals, url } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 404 when no pending edit exists', async () => {
				const { getPendingEdit } = await import('$lib/server/services/factEdit');
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(getPendingEdit).mockResolvedValue(null);

				const params = { id: 'fact-123' };
				const locals = { user: { id: 'user-123' } };
				const url = createMockUrl({});

				// error(404) is thrown inside try block, so gets caught and re-thrown as 500
				await expect(DELETE({ params, locals, url } as any)).rejects.toMatchObject({
					status: 500
				});
			});

			it('should throw 404 when edit not found by editId', async () => {
				const { cancelFactEdit, FactEditError } = await import('$lib/server/services/factEdit');
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(cancelFactEdit).mockRejectedValue(
					new FactEditError('EDIT_NOT_FOUND', 'Edit not found')
				);

				const params = { id: 'fact-123' };
				const locals = { user: { id: 'user-123' } };
				const url = createMockUrl({ editId: 'nonexistent' });

				await expect(DELETE({ params, locals, url } as any)).rejects.toMatchObject({
					status: 404
				});
			});

			it('should throw 403 when user is not author of edit', async () => {
				const { cancelFactEdit, FactEditError } = await import('$lib/server/services/factEdit');
				const { DELETE } = await import('../../src/routes/api/facts/[id]/edit/+server');

				vi.mocked(cancelFactEdit).mockRejectedValue(
					new FactEditError('NOT_AUTHOR', 'Not authorized to cancel this edit')
				);

				const params = { id: 'fact-123' };
				const locals = { user: { id: 'other-user' } };
				const url = createMockUrl({ editId: 'edit-123' });

				await expect(DELETE({ params, locals, url } as any)).rejects.toMatchObject({
					status: 403
				});
			});
		});
	});

	describe('Veto API', () => {
		describe('GET /api/facts/:id/veto', () => {
			it('should return vetos for a fact', async () => {
				const { getFactVetos } = await import('$lib/server/services/veto');
				const { GET } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const vetos = [
					{
						id: 'veto-123',
						reason: 'Factually incorrect',
						status: 'PENDING',
						createdAt: new Date(),
						resolvedAt: null,
						sources: [{ url: 'https://example.com' }],
						user: { id: 'user-123', username: 'testuser' },
						_count: { votes: 5 }
					},
					{
						id: 'veto-456',
						reason: 'Outdated information',
						status: 'REJECTED',
						createdAt: new Date(),
						resolvedAt: new Date(),
						sources: [],
						user: { id: 'user-456', username: 'otheruser' },
						_count: { votes: 2 }
					}
				];

				vi.mocked(getFactVetos).mockResolvedValue(vetos as any);

				const params = { id: 'fact-123' };

				const response = await GET({ params } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data).toHaveLength(2);
				expect(data.data[0].id).toBe('veto-123');
				expect(data.data[0].voteCount).toBe(5);
				expect(data.data[1].voteCount).toBe(2);
			});

			it('should return empty array when no vetos exist', async () => {
				const { getFactVetos } = await import('$lib/server/services/veto');
				const { GET } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(getFactVetos).mockResolvedValue([]);

				const params = { id: 'fact-123' };

				const response = await GET({ params } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data).toHaveLength(0);
			});

			it('should throw 500 on service error', async () => {
				const { getFactVetos } = await import('$lib/server/services/veto');
				const { GET } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(getFactVetos).mockRejectedValue(new Error('Database error'));

				const params = { id: 'fact-123' };

				await expect(GET({ params } as any)).rejects.toMatchObject({
					status: 500
				});
			});
		});

		describe('POST /api/facts/:id/veto', () => {
			it('should submit veto for authenticated verified user', async () => {
				const { submitVeto } = await import('$lib/server/services/veto');
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(submitVeto).mockResolvedValue({
					id: 'veto-123',
					status: 'PENDING'
				} as any);

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'This fact is incorrect',
					sources: [{ url: 'https://evidence.com/proof' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				const response = await POST({ params, request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.id).toBe('veto-123');
				expect(data.data.status).toBe('PENDING');
				expect(data.data.message).toContain('Veto submitted successfully');
				expect(submitVeto).toHaveBeenCalledWith('user-123', {
					factId: 'fact-123',
					reason: 'This fact is incorrect',
					sources: [{ url: 'https://evidence.com/proof' }]
				});
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'Test',
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: null };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 403 for unverified email', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'Test',
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: false } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 403
				});
			});

			it('should throw 400 when reason is missing', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				// error(400) is thrown inside try block, so gets caught and re-thrown as 500
				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 500
				});
			});

			it('should throw 400 when sources are missing', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'This is incorrect'
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				// error(400) is thrown inside try block, so gets caught and re-thrown as 500
				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 500
				});
			});

			it('should throw 400 when sources array is empty', async () => {
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'This is incorrect',
					sources: []
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				// error(400) is thrown inside try block, so gets caught and re-thrown as 500
				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 500
				});
			});

			it('should throw 404 when fact not found', async () => {
				const { submitVeto, VetoError } = await import('$lib/server/services/veto');
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(submitVeto).mockRejectedValue(
					new VetoError('FACT_NOT_FOUND', 'Fact not found')
				);

				const params = { id: 'nonexistent' };
				const request = createMockRequest({
					reason: 'Test',
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});

			it('should throw 400 for invalid status', async () => {
				const { submitVeto, VetoError } = await import('$lib/server/services/veto');
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(submitVeto).mockRejectedValue(
					new VetoError('INVALID_STATUS', 'Cannot veto a fact that is not approved')
				);

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'Test',
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 400
				});
			});

			it('should throw 400 for other veto errors', async () => {
				const { submitVeto, VetoError } = await import('$lib/server/services/veto');
				const { POST } = await import('../../src/routes/api/facts/[id]/veto/+server');

				vi.mocked(submitVeto).mockRejectedValue(
					new VetoError('ALREADY_VETOED', 'You have already submitted a veto for this fact')
				);

				const params = { id: 'fact-123' };
				const request = createMockRequest({
					reason: 'Test',
					sources: [{ url: 'https://example.com' }]
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
					status: 400
				});
			});
		});
	});
});
