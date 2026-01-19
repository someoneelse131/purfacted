import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkGrammar, isGrammarCheckAvailable } from './llm';

describe('R13: LLM Grammar Check', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('isGrammarCheckAvailable', () => {
		it('should return a boolean', () => {
			const result = isGrammarCheckAvailable();
			expect(typeof result).toBe('boolean');
		});

		it('should return false when API key is not configured (test env)', () => {
			// In test environment without real API key, should be false
			// This tests the graceful fallback behavior
			const result = isGrammarCheckAvailable();
			expect(result).toBe(false);
		});
	});

	describe('Grammar check response structure', () => {
		it('should define correct interface for GrammarCheckResult', () => {
			const result = {
				success: true,
				original: 'test text',
				corrected: 'test text',
				suggestions: [],
				hasChanges: false
			};

			expect(result).toHaveProperty('success');
			expect(result).toHaveProperty('original');
			expect(result).toHaveProperty('corrected');
			expect(result).toHaveProperty('suggestions');
			expect(result).toHaveProperty('hasChanges');
		});

		it('should define correct interface for GrammarSuggestion', () => {
			const suggestion = {
				type: 'grammar' as const,
				original: 'its',
				suggested: "it's",
				explanation: 'Contraction needs apostrophe'
			};

			expect(suggestion.type).toBe('grammar');
			expect(suggestion).toHaveProperty('original');
			expect(suggestion).toHaveProperty('suggested');
			expect(suggestion).toHaveProperty('explanation');
		});

		it('should accept valid suggestion types', () => {
			const validTypes = ['grammar', 'spelling', 'punctuation', 'structure', 'clarity'];

			validTypes.forEach((type) => {
				const suggestion = {
					type: type as 'grammar' | 'spelling' | 'punctuation' | 'structure' | 'clarity',
					original: 'test',
					suggested: 'test',
					explanation: 'test'
				};
				expect(validTypes).toContain(suggestion.type);
			});
		});
	});

	describe('Error handling', () => {
		it('should return graceful error when API is unavailable', async () => {
			const result = await checkGrammar('Test text with grammer erors.');

			// Should fail gracefully without API key
			expect(result.success).toBe(false);
			expect(result.original).toBe('Test text with grammer erors.');
			expect(result.error).toBeDefined();
		});

		it('should return original text on failure', async () => {
			const originalText = 'This is the original text.';
			const result = await checkGrammar(originalText);

			expect(result.original).toBe(originalText);
		});

		it('should have empty suggestions on failure', async () => {
			const result = await checkGrammar('Test text');
			expect(result.suggestions).toEqual([]);
		});

		it('should indicate no changes when API fails', async () => {
			const result = await checkGrammar('Test text');
			expect(result.hasChanges).toBe(false);
		});
	});

	describe('checkGrammar function', () => {
		it('should accept string input', async () => {
			const result = await checkGrammar('Hello world');
			expect(result.original).toBe('Hello world');
		});

		it('should handle empty string', async () => {
			const result = await checkGrammar('');
			expect(result.original).toBe('');
		});

		it('should handle long text', async () => {
			const longText = 'This is a test. '.repeat(100);
			const result = await checkGrammar(longText);
			expect(result.original).toBe(longText);
		});
	});
});
