// Archive provider (R26): turns a source URL into an archive.org snapshot URL.
// The job processor calls this; it is injected so tests can mock the HTTP call.

export type Archiver = (url: string) => Promise<string>;

const SPN_BASE = 'https://web.archive.org';

// Real "Save Page Now" archiver: asks archive.org to snapshot the URL and
// returns the canonical snapshot URL. archive.org echoes the stored path in a
// `Content-Location: /web/<timestamp>/<url>` header on the save response. A
// missing header (rate-limited, soft error) throws so the job retries.
export const liveArchiver: Archiver = async (url) => {
	const res = await fetch(`${SPN_BASE}/save/${url}`, {
		method: 'GET',
		redirect: 'follow',
		headers: { 'User-Agent': 'PurFacted/2.0 (+https://purfacted.com)' }
	});
	const location = res.headers.get('content-location');
	if (location && location.startsWith('/web/')) {
		return `${SPN_BASE}${location}`;
	}
	if (!res.ok) {
		throw new Error(`archive.org save failed: HTTP ${res.status}`);
	}
	throw new Error('archive.org save returned no snapshot location');
};

// Dev/test archiver: returns a deterministic snapshot URL without any network
// call. Used unless ARCHIVE_LIVE=true, so local dev, CI and E2E never hit the
// real archive.org service (mirrors EMAIL_DEV_MAILBOX for the mail transport).
export const devArchiver: Archiver = async (url) => `${SPN_BASE}/web/0/${url}`;

export function createArchiver(env: { ARCHIVE_LIVE?: string }): Archiver {
	return env.ARCHIVE_LIVE === 'true' ? liveArchiver : devArchiver;
}
