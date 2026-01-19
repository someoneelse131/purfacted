import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

/**
 * Hashes a password using scrypt
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_LENGTH);
	const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
	return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const [saltHex, keyHex] = hash.split(':');

	if (!saltHex || !keyHex) {
		return false;
	}

	const salt = Buffer.from(saltHex, 'hex');
	const storedKey = Buffer.from(keyHex, 'hex');
	const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

	return timingSafeEqual(storedKey, derivedKey);
}

/**
 * Generates a secure random token
 */
export function generateToken(length: number = 32): string {
	return randomBytes(length).toString('hex');
}

/**
 * Generates a URL-safe token
 */
export function generateUrlSafeToken(length: number = 32): string {
	return randomBytes(length).toString('base64url');
}

/**
 * Creates a hash of a string (for comparison, not passwords)
 */
export function sha256(data: string): string {
	return createHash('sha256').update(data).digest('hex');
}
