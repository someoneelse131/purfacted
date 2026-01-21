import { db } from './db';
import type { UserType } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';

const SESSION_DURATION_DAYS = parseInt(process.env.SESSION_DURATION_DAYS || '7', 10);
const SESSION_REMEMBER_ME_DAYS = parseInt(process.env.SESSION_REMEMBER_ME_DAYS || '30', 10);

// Constants
const SESSION_ID_LENGTH = 32;
const SESSION_COOKIE_NAME = 'auth_session';

// Generate a secure session ID
function generateSessionId(): string {
	return randomBytes(SESSION_ID_LENGTH).toString('base64url');
}

// Hash session ID for storage (timing-attack safe)
function hashSessionId(sessionId: string): string {
	return createHash('sha256').update(sessionId).digest('hex');
}

export interface User {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	emailVerified: boolean;
	userType: UserType;
	trustScore: number;
	banLevel: number;
	bannedUntil: Date | null;
}

export interface Session {
	id: string;
	userId: string;
	expiresAt: Date;
	fresh: boolean;
}

export interface SessionCookie {
	name: string;
	value: string;
	attributes: {
		httpOnly: boolean;
		secure: boolean;
		sameSite: 'lax' | 'strict' | 'none';
		path: string;
		maxAge?: number;
		expires?: Date;
	};
	serialize(): string;
}

interface DatabaseUserAttributes {
	email: string;
	firstName: string;
	lastName: string;
	emailVerified: boolean;
	userType: UserType;
	trustScore: number;
	banLevel: number;
	bannedUntil: Date | null;
}

function serializeCookie(name: string, value: string, attributes: SessionCookie['attributes']): string {
	let cookie = `${name}=${value}`;

	if (attributes.httpOnly) cookie += '; HttpOnly';
	if (attributes.secure) cookie += '; Secure';
	if (attributes.sameSite) cookie += `; SameSite=${attributes.sameSite.charAt(0).toUpperCase() + attributes.sameSite.slice(1)}`;
	if (attributes.path) cookie += `; Path=${attributes.path}`;
	if (attributes.maxAge !== undefined) cookie += `; Max-Age=${attributes.maxAge}`;
	if (attributes.expires) cookie += `; Expires=${attributes.expires.toUTCString()}`;

	return cookie;
}

function createCookieAttributes(secure: boolean, maxAge?: number): SessionCookie['attributes'] {
	return {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		path: '/',
		maxAge
	};
}

class SessionManager {
	private sessionDurationMs: number;
	public sessionCookieName = SESSION_COOKIE_NAME;
	private isSecure: boolean;

	constructor(durationDays: number) {
		this.sessionDurationMs = durationDays * 24 * 60 * 60 * 1000;
		this.isSecure = process.env.NODE_ENV === 'production';
	}

	async createSession(userId: string, _attributes: Record<string, unknown>): Promise<Session> {
		const sessionId = generateSessionId();
		const expiresAt = new Date(Date.now() + this.sessionDurationMs);

		await db.session.create({
			data: {
				id: sessionId,
				userId,
				expiresAt
			}
		});

		return {
			id: sessionId,
			userId,
			expiresAt,
			fresh: true
		};
	}

	async validateSession(sessionId: string): Promise<{ session: Session | null; user: User | null }> {
		const dbSession = await db.session.findUnique({
			where: { id: sessionId },
			include: {
				user: true
			}
		});

		if (!dbSession) {
			return { session: null, user: null };
		}

		// Check if session is expired
		if (dbSession.expiresAt < new Date()) {
			await db.session.delete({ where: { id: sessionId } });
			return { session: null, user: null };
		}

		// Check if session needs to be refreshed (at 50% mark)
		const halfwayPoint = new Date(dbSession.expiresAt.getTime() - this.sessionDurationMs / 2);
		const shouldRefresh = new Date() > halfwayPoint;

		let session: Session = {
			id: dbSession.id,
			userId: dbSession.userId,
			expiresAt: dbSession.expiresAt,
			fresh: false
		};

		// Refresh the session if past halfway point
		if (shouldRefresh) {
			const newExpiresAt = new Date(Date.now() + this.sessionDurationMs);
			await db.session.update({
				where: { id: sessionId },
				data: { expiresAt: newExpiresAt }
			});
			session = {
				...session,
				expiresAt: newExpiresAt,
				fresh: true
			};
		}

		const user: User = {
			id: dbSession.user.id,
			email: dbSession.user.email,
			firstName: dbSession.user.firstName,
			lastName: dbSession.user.lastName,
			emailVerified: dbSession.user.emailVerified,
			userType: dbSession.user.userType,
			trustScore: dbSession.user.trustScore,
			banLevel: dbSession.user.banLevel,
			bannedUntil: dbSession.user.bannedUntil
		};

		return { session, user };
	}

	async invalidateSession(sessionId: string): Promise<void> {
		await db.session.deleteMany({
			where: { id: sessionId }
		});
	}

	async invalidateUserSessions(userId: string): Promise<void> {
		await db.session.deleteMany({
			where: { userId }
		});
	}

	createSessionCookie(sessionId: string): SessionCookie {
		const maxAge = Math.floor(this.sessionDurationMs / 1000);
		const attributes = createCookieAttributes(this.isSecure, maxAge);

		return {
			name: this.sessionCookieName,
			value: sessionId,
			attributes,
			serialize: () => serializeCookie(this.sessionCookieName, sessionId, attributes)
		};
	}

	createBlankSessionCookie(): SessionCookie {
		const attributes = createCookieAttributes(this.isSecure, 0);

		return {
			name: this.sessionCookieName,
			value: '',
			attributes,
			serialize: () => serializeCookie(this.sessionCookieName, '', attributes)
		};
	}
}

// Standard session manager (7 days by default)
export const lucia = new SessionManager(SESSION_DURATION_DAYS);

// Extended session manager for "remember me" (30 days by default)
export const luciaRememberMe = new SessionManager(SESSION_REMEMBER_ME_DAYS);
