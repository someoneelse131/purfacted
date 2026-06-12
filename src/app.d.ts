// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SafeUser } from '$lib/server/services/auth/session';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: SafeUser | null;
			sessionToken: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
