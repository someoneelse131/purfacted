import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchiver, devArchiver, liveArchiver } from './provider';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('archive provider selection (R26)', () => {
	it('uses the live archiver only when ARCHIVE_LIVE=true', () => {
		expect(createArchiver({ ARCHIVE_LIVE: 'true' })).toBe(liveArchiver);
		expect(createArchiver({ ARCHIVE_LIVE: 'false' })).toBe(devArchiver);
		expect(createArchiver({})).toBe(devArchiver);
	});

	it('the dev archiver is deterministic and makes no network call', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const url = 'https://example.org/study';
		expect(await devArchiver(url)).toBe(`https://web.archive.org/web/0/${url}`);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('live archiver (R26)', () => {
	it('returns the snapshot URL from the content-location header', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				headers: new Headers({
					'content-location': '/web/20260614/https://example.org/study'
				})
			})
		);
		const result = await liveArchiver('https://example.org/study');
		expect(result).toBe('https://web.archive.org/web/20260614/https://example.org/study');
	});

	it('throws when archive.org returns no snapshot location (so the job retries)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers() })
		);
		await expect(liveArchiver('https://example.org/study')).rejects.toThrow();
	});

	it('throws on an HTTP error response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers() })
		);
		await expect(liveArchiver('https://example.org/study')).rejects.toThrow('429');
	});
});
