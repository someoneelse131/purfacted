import { describe, expect, it } from 'vitest';
import { verifyCaptcha } from './captcha';

describe('captcha verification', () => {
	it('passes when no secret key is configured (dev mode)', async () => {
		expect(await verifyCaptcha(undefined, undefined, '127.0.0.1')).toBe(true);
		expect(await verifyCaptcha('', 'token', '127.0.0.1')).toBe(true);
	});

	it('fails closed when a secret is set but no token arrives', async () => {
		expect(await verifyCaptcha('secret-key', undefined, '127.0.0.1')).toBe(false);
	});
});
