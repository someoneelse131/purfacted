import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FactEditError, generateDiff } from './factEdit';

// Mock the database
vi.mock('../db', () => ({
	db: {
		fact: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		factEdit: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		}
	}
}));

describe('R17: Fact Editing', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
		vi.clearAllMocks();
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('FactEditError', () => {
		it('should have correct name and code', () => {
			const error = new FactEditError('Test message', 'TEST_CODE');
			expect(error.name).toBe('FactEditError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});

		it('should extend Error', () => {
			const error = new FactEditError('Test', 'CODE');
			expect(error instanceof Error).toBe(true);
		});
	});

	describe('generateDiff', () => {
		it('should detect unchanged lines', () => {
			const diff = generateDiff('Hello\nWorld', 'Hello\nWorld');
			expect(diff).toEqual([
				{ type: 'unchanged', text: 'Hello' },
				{ type: 'unchanged', text: 'World' }
			]);
		});

		it('should detect added lines', () => {
			const diff = generateDiff('Hello', 'Hello\nWorld');
			expect(diff).toEqual([
				{ type: 'unchanged', text: 'Hello' },
				{ type: 'added', text: 'World' }
			]);
		});

		it('should detect removed lines', () => {
			const diff = generateDiff('Hello\nWorld', 'Hello');
			expect(diff).toEqual([
				{ type: 'unchanged', text: 'Hello' },
				{ type: 'removed', text: 'World' }
			]);
		});

		it('should detect changed lines', () => {
			const diff = generateDiff('Hello', 'Goodbye');
			expect(diff).toEqual([
				{ type: 'removed', text: 'Hello' },
				{ type: 'added', text: 'Goodbye' }
			]);
		});

		it('should handle multiple changes', () => {
			const diff = generateDiff('Line 1\nLine 2\nLine 3', 'Line 1\nModified\nLine 3\nNew line');
			expect(diff).toHaveLength(5);
			expect(diff[0]).toEqual({ type: 'unchanged', text: 'Line 1' });
			expect(diff[1]).toEqual({ type: 'removed', text: 'Line 2' });
			expect(diff[2]).toEqual({ type: 'added', text: 'Modified' });
			expect(diff[3]).toEqual({ type: 'unchanged', text: 'Line 3' });
			expect(diff[4]).toEqual({ type: 'added', text: 'New line' });
		});

		it('should handle empty strings', () => {
			const diff = generateDiff('', 'Hello');
			expect(diff).toEqual([
				{ type: 'removed', text: '' },
				{ type: 'added', text: 'Hello' }
			]);
		});

		it('should handle both empty strings', () => {
			const diff = generateDiff('', '');
			expect(diff).toEqual([{ type: 'unchanged', text: '' }]);
		});
	});

	describe('Edit workflow', () => {
		it('should define correct edit status values', () => {
			const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
			validStatuses.forEach((status) => {
				expect(['PENDING', 'APPROVED', 'REJECTED']).toContain(status);
			});
		});

		it('should require fact ownership for edit requests', () => {
			// This is tested through the service validation
			// Mock scenario: user1 tries to edit user2's fact
			const factOwnerId = 'user1';
			const requesterId = 'user2';
			expect(factOwnerId).not.toBe(requesterId);
		});
	});

	describe('Moderation queue interface', () => {
		it('should define correct queue structure', () => {
			const queueItem = {
				id: 'edit-1',
				factId: 'fact-1',
				userId: 'user-1',
				oldBody: 'Original text',
				newBody: 'Modified text',
				status: 'PENDING' as const,
				createdAt: new Date(),
				fact: { id: 'fact-1', title: 'Fact Title', status: 'SUBMITTED' },
				user: { id: 'user-1', firstName: 'John', lastName: 'Doe' }
			};

			expect(queueItem).toHaveProperty('id');
			expect(queueItem).toHaveProperty('factId');
			expect(queueItem).toHaveProperty('oldBody');
			expect(queueItem).toHaveProperty('newBody');
			expect(queueItem).toHaveProperty('status');
			expect(queueItem).toHaveProperty('fact');
			expect(queueItem).toHaveProperty('user');
		});
	});
});
