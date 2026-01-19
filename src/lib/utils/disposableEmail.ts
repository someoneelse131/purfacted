const DISPOSABLE_EMAIL_API_URL =
	process.env.DISPOSABLE_EMAIL_API_URL || 'https://disposable.debounce.io';

// Common disposable email domains (fallback list)
const KNOWN_DISPOSABLE_DOMAINS = new Set([
	'tempmail.com',
	'throwaway.email',
	'guerrillamail.com',
	'10minutemail.com',
	'mailinator.com',
	'temp-mail.org',
	'fakeinbox.com',
	'getnada.com',
	'yopmail.com',
	'trashmail.com',
	'sharklasers.com',
	'guerrillamail.info',
	'grr.la',
	'guerrillamail.biz',
	'guerrillamail.de',
	'guerrillamail.net',
	'guerrillamail.org',
	'spam4.me',
	'maildrop.cc',
	'mailnesia.com'
]);

interface DisposableCheckResult {
	isDisposable: boolean;
	source: 'api' | 'fallback';
	error?: string;
}

/**
 * Checks if an email address uses a disposable email domain
 * Uses external API with fallback to local list
 */
export async function isDisposableEmail(email: string): Promise<DisposableCheckResult> {
	const domain = email.split('@')[1]?.toLowerCase();

	if (!domain) {
		return { isDisposable: false, source: 'fallback', error: 'Invalid email format' };
	}

	// First check against known list (fast path)
	if (KNOWN_DISPOSABLE_DOMAINS.has(domain)) {
		return { isDisposable: true, source: 'fallback' };
	}

	// Try API check
	try {
		const response = await fetch(`${DISPOSABLE_EMAIL_API_URL}/?email=${encodeURIComponent(email)}`, {
			method: 'GET',
			headers: {
				Accept: 'application/json'
			},
			signal: AbortSignal.timeout(5000) // 5 second timeout
		});

		if (!response.ok) {
			// API failed, use fallback result
			return { isDisposable: false, source: 'fallback' };
		}

		const data = await response.json();

		// debounce.io API returns { disposable: "true" | "false" }
		const isDisposable = data.disposable === 'true' || data.disposable === true;

		return { isDisposable, source: 'api' };
	} catch (error) {
		// API call failed (network error, timeout, etc.)
		// Return false (allow) but note it was a fallback
		return {
			isDisposable: false,
			source: 'fallback',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Validates that email is not from a disposable provider
 * Throws an error if disposable email is detected
 */
export async function validateNotDisposable(email: string): Promise<void> {
	const result = await isDisposableEmail(email);

	if (result.isDisposable) {
		throw new Error('Disposable email addresses are not allowed. Please use a permanent email address.');
	}
}
