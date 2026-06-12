import { createHmac, timingSafeEqual } from 'node:crypto';

// One-click unsubscribe tokens: HMAC-signed, no DB round trip needed.
// Token format: base64url(userId:scope).base64url(hmac)

function sign(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createUnsubscribeToken(userId: string, scope: string, secret: string): string {
	const payload = Buffer.from(`${userId}:${scope}`).toString('base64url');
	return `${payload}.${sign(payload, secret)}`;
}

export function verifyUnsubscribeToken(
	token: string,
	secret: string
): { userId: string; scope: string } | null {
	const [payload, signature] = token.split('.');
	if (!payload || !signature) return null;
	const expected = sign(payload, secret);
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const decoded = Buffer.from(payload, 'base64url').toString();
	const sep = decoded.indexOf(':');
	if (sep < 1) return null;
	return { userId: decoded.slice(0, sep), scope: decoded.slice(sep + 1) };
}
