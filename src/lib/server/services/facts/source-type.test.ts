import { describe, expect, it } from 'vitest';
import { suggestSourceType } from './source-type';

describe('suggestSourceType', () => {
	it('detects peer-reviewed domains', () => {
		expect(suggestSourceType('https://doi.org/10.1000/xyz')).toBe('PEER_REVIEWED');
		expect(suggestSourceType('https://www.nature.com/articles/abc')).toBe('PEER_REVIEWED');
		expect(suggestSourceType('https://pubmed.ncbi.nlm.nih.gov/12345/')).toBe('PEER_REVIEWED');
	});

	it('detects official domains incl. gov suffixes', () => {
		expect(suggestSourceType('https://www.who.int/news/x')).toBe('OFFICIAL');
		expect(suggestSourceType('https://www.cdc.gov/flu/index.html')).toBe('OFFICIAL');
		expect(suggestSourceType('https://www.bag.admin.ch/covid')).toBe('OFFICIAL');
	});

	it('detects news and blogs', () => {
		expect(suggestSourceType('https://www.reuters.com/world/x')).toBe('NEWS');
		expect(suggestSourceType('https://www.nzz.ch/wissenschaft/y')).toBe('NEWS');
		expect(suggestSourceType('https://someone.substack.com/p/z')).toBe('BLOG');
		expect(suggestSourceType('https://medium.com/@a/b')).toBe('BLOG');
	});

	it('falls back to OTHER for unknown or invalid urls', () => {
		expect(suggestSourceType('https://random-company-site.com/page')).toBe('OTHER');
		expect(suggestSourceType('not a url')).toBe('OTHER');
	});
});
