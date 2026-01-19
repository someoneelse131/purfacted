import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateFactInput, FactValidationError } from './fact';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn()
		},
		fact: {
			count: vi.fn(),
			create: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		category: {
			findUnique: vi.fn()
		},
		source: {
			create: vi.fn(),
			findMany: vi.fn()
		}
	}
}));

describe('R12: Fact Creation', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
		vi.clearAllMocks();
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('validateFactInput', () => {
		const validInput = {
			title: 'Test Fact Title',
			body: 'This is the body of the test fact with enough content.',
			sources: [{ url: 'https://example.com/source' }]
		};

		it('should pass validation for valid input', () => {
			expect(() => validateFactInput(validInput)).not.toThrow();
		});

		it('should throw error for missing title', () => {
			const input = { ...validInput, title: '' };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('Title is required');
		});

		it('should throw error for title too long', () => {
			const input = { ...validInput, title: 'a'.repeat(201) };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('200 characters or less');
		});

		it('should throw error for missing body', () => {
			const input = { ...validInput, body: '' };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('Body is required');
		});

		it('should throw error for body too long', () => {
			const input = { ...validInput, body: 'a'.repeat(5001) };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('5000 characters or less');
		});

		it('should throw error for missing sources', () => {
			const input = { ...validInput, sources: [] };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('At least one source is required');
		});

		it('should throw error for invalid source URL', () => {
			const input = { ...validInput, sources: [{ url: 'not-a-valid-url' }] };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('Invalid source URL');
		});

		it('should throw error for empty source URL', () => {
			const input = { ...validInput, sources: [{ url: '' }] };
			expect(() => validateFactInput(input)).toThrow(FactValidationError);
			expect(() => validateFactInput(input)).toThrow('Source URL is required');
		});

		it('should accept multiple valid sources', () => {
			const input = {
				...validInput,
				sources: [
					{ url: 'https://example.com/source1' },
					{ url: 'https://example.com/source2' },
					{ url: 'https://example.com/source3' }
				]
			};
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should accept source with optional title', () => {
			const input = {
				...validInput,
				sources: [{ url: 'https://example.com/source', title: 'Source Title' }]
			};
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should accept source with optional type', () => {
			const input = {
				...validInput,
				sources: [{ url: 'https://example.com/source', type: 'NEWS' as const }]
			};
			expect(() => validateFactInput(input)).not.toThrow();
		});
	});

	describe('FactValidationError', () => {
		it('should have correct name and code', () => {
			const error = new FactValidationError('Test message', 'TEST_CODE');
			expect(error.name).toBe('FactValidationError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Title validation edge cases', () => {
		const validInput = {
			title: 'Test',
			body: 'Body content',
			sources: [{ url: 'https://example.com' }]
		};

		it('should accept title at max length (200 chars)', () => {
			const input = { ...validInput, title: 'a'.repeat(200) };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should trim whitespace in validation check', () => {
			const input = { ...validInput, title: '   ' };
			expect(() => validateFactInput(input)).toThrow('Title is required');
		});
	});

	describe('Body validation edge cases', () => {
		const validInput = {
			title: 'Test',
			body: 'Body',
			sources: [{ url: 'https://example.com' }]
		};

		it('should accept body at max length (5000 chars)', () => {
			const input = { ...validInput, body: 'a'.repeat(5000) };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should trim whitespace in validation check', () => {
			const input = { ...validInput, body: '   ' };
			expect(() => validateFactInput(input)).toThrow('Body is required');
		});
	});

	describe('URL validation', () => {
		const validInput = {
			title: 'Test',
			body: 'Body',
			sources: [{ url: 'https://example.com' }]
		};

		it('should accept HTTPS URLs', () => {
			const input = { ...validInput, sources: [{ url: 'https://secure.example.com/path' }] };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should accept HTTP URLs', () => {
			const input = { ...validInput, sources: [{ url: 'http://example.com/path' }] };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should accept URLs with query strings', () => {
			const input = { ...validInput, sources: [{ url: 'https://example.com/path?query=value' }] };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should accept URLs with fragments', () => {
			const input = { ...validInput, sources: [{ url: 'https://example.com/path#section' }] };
			expect(() => validateFactInput(input)).not.toThrow();
		});

		it('should reject URLs without protocol', () => {
			const input = { ...validInput, sources: [{ url: 'example.com/path' }] };
			expect(() => validateFactInput(input)).toThrow('Invalid source URL');
		});

		it('should reject malformed URLs', () => {
			const input = { ...validInput, sources: [{ url: 'http://' }] };
			expect(() => validateFactInput(input)).toThrow('Invalid source URL');
		});
	});
});
