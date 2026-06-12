import { describe, expect, it } from 'vitest';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

const SECRET = 'test-secret';

describe('unsubscribe tokens', () => {
	it('round-trips userId and scope', () => {
		const token = createUnsubscribeToken('user_1', 'digest', SECRET);
		expect(verifyUnsubscribeToken(token, SECRET)).toEqual({ userId: 'user_1', scope: 'digest' });
	});

	it('rejects tampered tokens', () => {
		const token = createUnsubscribeToken('user_1', 'digest', SECRET);
		const [, sig] = token.split('.');
		const forged = `${Buffer.from('user_2:digest').toString('base64url')}.${sig}`;
		expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
	});

	it('rejects tokens signed with another secret', () => {
		const token = createUnsubscribeToken('user_1', 'digest', 'other-secret');
		expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
	});

	it('rejects malformed tokens', () => {
		expect(verifyUnsubscribeToken('garbage', SECRET)).toBeNull();
		expect(verifyUnsubscribeToken('', SECRET)).toBeNull();
	});
});
