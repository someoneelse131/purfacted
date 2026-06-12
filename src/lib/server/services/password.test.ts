import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
	it('verifies a correct password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
	});

	it('rejects a wrong password', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(await verifyPassword('wrong horse', hash)).toBe(false);
	});

	it('produces unique salts', async () => {
		const a = await hashPassword('same password');
		const b = await hashPassword('same password');
		expect(a).not.toBe(b);
	});

	it('rejects malformed stored hashes without throwing', async () => {
		expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
		expect(await verifyPassword('x', '')).toBe(false);
		expect(await verifyPassword('x', 'bcrypt$something$else$entirely$x$y')).toBe(false);
	});
});
