import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt-based password hashing (no native dependencies).
// Format: scrypt$N$r$p$<salt hex>$<hash hex>

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
	return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const [, n, r, p, saltHex, hashHex] = parts;
	const expected = Buffer.from(hashHex, 'hex');
	const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
		N: Number(n),
		r: Number(r),
		p: Number(p),
		maxmem: MAXMEM
	});
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
