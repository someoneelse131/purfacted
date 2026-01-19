import { Lucia, TimeSpan } from 'lucia';
import { PrismaAdapter } from '@lucia-auth/adapter-prisma';
import { db } from './db';
import type { UserType } from '@prisma/client';

const SESSION_DURATION_DAYS = parseInt(process.env.SESSION_DURATION_DAYS || '7', 10);
const SESSION_REMEMBER_ME_DAYS = parseInt(process.env.SESSION_REMEMBER_ME_DAYS || '30', 10);

const adapter = new PrismaAdapter(db.session, db.user);

export const lucia = new Lucia(adapter, {
	sessionExpiresIn: new TimeSpan(SESSION_DURATION_DAYS, 'd'),
	sessionCookie: {
		attributes: {
			secure: process.env.NODE_ENV === 'production'
		}
	},
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			firstName: attributes.firstName,
			lastName: attributes.lastName,
			emailVerified: attributes.emailVerified,
			userType: attributes.userType,
			trustScore: attributes.trustScore,
			banLevel: attributes.banLevel,
			bannedUntil: attributes.bannedUntil
		};
	}
});

// Extended session duration for "remember me"
export const luciaRememberMe = new Lucia(adapter, {
	sessionExpiresIn: new TimeSpan(SESSION_REMEMBER_ME_DAYS, 'd'),
	sessionCookie: {
		attributes: {
			secure: process.env.NODE_ENV === 'production'
		}
	},
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			firstName: attributes.firstName,
			lastName: attributes.lastName,
			emailVerified: attributes.emailVerified,
			userType: attributes.userType,
			trustScore: attributes.trustScore,
			banLevel: attributes.banLevel,
			bannedUntil: attributes.bannedUntil
		};
	}
});

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
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
