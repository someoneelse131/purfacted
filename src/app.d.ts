// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SafeUser } from '$lib/server/services/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SafeUser | null;
			sessionToken: string | null;
			// set by the central rate limiter when an IP burns its budget (R19)
			suspicious: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
