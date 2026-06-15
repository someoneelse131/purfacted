import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getCredentialFile, readCredential } from '$lib/server/services/experts';
import { requireModerator } from '$lib/server/guards';

// Moderator-only credential download (R34). Credential files live outside the
// web root, so they are streamed here behind the moderator guard rather than
// served statically. inline so PDFs/images render in the browser tab.
export const GET: RequestHandler = async ({ params, locals }) => {
	requireModerator(locals.user);
	const file = await getCredentialFile(authDeps(), params.id);
	if (!file) error(404, 'Credential not found.');
	const bytes = await readCredential(file.absPath);
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': file.mime,
			'Content-Disposition': 'inline',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
