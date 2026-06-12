// Shared access to APP_SECRET (signs unsubscribe tokens and other links).
// In production a real secret is mandatory: signing with the well-known dev
// fallback would let anyone forge tokens. getAppSecret() therefore fails
// closed; assertAppSecret() is called at startup (hooks.server.ts) so a
// misconfigured deployment dies immediately instead of on first use.

const DEV_FALLBACK = 'dev-secret-change-me';

export function getAppSecret(): string {
	const secret = process.env.APP_SECRET;
	if (process.env.NODE_ENV === 'production' && (!secret || secret === DEV_FALLBACK)) {
		throw new Error(
			'APP_SECRET is unset or still the dev default. Set a long random value in production.'
		);
	}
	return secret || DEV_FALLBACK;
}

export function assertAppSecret(): void {
	getAppSecret();
}
