import Anthropic from '@anthropic-ai/sdk';

// Configuration
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'claude-3-haiku-20240307';
const FEATURE_LLM_GRAMMAR_CHECK = process.env.FEATURE_LLM_GRAMMAR_CHECK !== 'false';

// Initialize Anthropic client
let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic | null {
	if (!LLM_API_KEY) {
		console.warn('LLM_API_KEY not configured');
		return null;
	}

	if (!anthropicClient) {
		anthropicClient = new Anthropic({
			apiKey: LLM_API_KEY
		});
	}

	return anthropicClient;
}

export interface GrammarCheckResult {
	success: boolean;
	original: string;
	corrected: string | null;
	suggestions: GrammarSuggestion[];
	hasChanges: boolean;
	error?: string;
}

export interface GrammarSuggestion {
	type: 'grammar' | 'spelling' | 'punctuation' | 'structure' | 'clarity';
	original: string;
	suggested: string;
	explanation: string;
}

/**
 * Check if LLM grammar checking is available
 */
export function isGrammarCheckAvailable(): boolean {
	return FEATURE_LLM_GRAMMAR_CHECK && !!LLM_API_KEY;
}

/**
 * Check grammar and structure of text using Claude
 */
export async function checkGrammar(text: string): Promise<GrammarCheckResult> {
	if (!FEATURE_LLM_GRAMMAR_CHECK) {
		return {
			success: true,
			original: text,
			corrected: null,
			suggestions: [],
			hasChanges: false,
			error: 'Grammar check feature is disabled'
		};
	}

	const client = getClient();
	if (!client) {
		return {
			success: false,
			original: text,
			corrected: null,
			suggestions: [],
			hasChanges: false,
			error: 'LLM API not configured'
		};
	}

	try {
		const response = await client.messages.create({
			model: LLM_MODEL,
			max_tokens: 2048,
			system: `You are a grammar and structure checker for a fact verification platform. Your job is to check text for grammar, spelling, punctuation, and structural issues WITHOUT changing the factual meaning.

IMPORTANT RULES:
1. Do NOT change any facts or claims in the text
2. Only fix grammar, spelling, punctuation, and clarity issues
3. Preserve the author's voice and intent
4. Keep technical terms and proper nouns unchanged
5. Do not add opinions or additional information

Respond in JSON format only:
{
  "corrected": "the corrected text (or null if no changes needed)",
  "suggestions": [
    {
      "type": "grammar|spelling|punctuation|structure|clarity",
      "original": "the original problematic text",
      "suggested": "the suggested fix",
      "explanation": "brief explanation of the issue"
    }
  ]
}`,
			messages: [
				{
					role: 'user',
					content: `Please check the following text for grammar and structure issues. Return ONLY valid JSON.\n\nText to check:\n${text}`
				}
			]
		});

		// Extract text content
		const content = response.content[0];
		if (content.type !== 'text') {
			throw new Error('Unexpected response format');
		}

		// Parse JSON response
		let parsed;
		try {
			// Try to extract JSON from the response (handle potential markdown wrapping)
			const jsonMatch = content.text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('No JSON found in response');
			}
			parsed = JSON.parse(jsonMatch[0]);
		} catch (parseError) {
			console.error('Failed to parse LLM response:', content.text);
			return {
				success: false,
				original: text,
				corrected: null,
				suggestions: [],
				hasChanges: false,
				error: 'Failed to parse grammar check response'
			};
		}

		const suggestions: GrammarSuggestion[] = (parsed.suggestions || []).map((s: any) => ({
			type: s.type || 'grammar',
			original: s.original || '',
			suggested: s.suggested || '',
			explanation: s.explanation || ''
		}));

		return {
			success: true,
			original: text,
			corrected: parsed.corrected || null,
			suggestions,
			hasChanges: parsed.corrected !== null && parsed.corrected !== text
		};
	} catch (error) {
		console.error('Grammar check error:', error);
		return {
			success: false,
			original: text,
			corrected: null,
			suggestions: [],
			hasChanges: false,
			error: error instanceof Error ? error.message : 'Grammar check failed'
		};
	}
}

/**
 * Check both title and body of a fact
 */
export async function checkFactGrammar(title: string, body: string): Promise<{
	title: GrammarCheckResult;
	body: GrammarCheckResult;
}> {
	// Run both checks in parallel
	const [titleResult, bodyResult] = await Promise.all([
		checkGrammar(title),
		checkGrammar(body)
	]);

	return {
		title: titleResult,
		body: bodyResult
	};
}

/**
 * Quick grammar check - just returns whether there are issues
 */
export async function hasGrammarIssues(text: string): Promise<boolean> {
	const result = await checkGrammar(text);
	return result.hasChanges;
}
