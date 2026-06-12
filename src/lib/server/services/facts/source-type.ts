import type { SourceType } from '@prisma/client';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';

// Auto-suggest a source type from the URL's domain (R10). The user can
// always correct the suggestion.

const PEER_REVIEWED = [
	'doi.org',
	'nature.com',
	'science.org',
	'sciencedirect.com',
	'springer.com',
	'pubmed.ncbi.nlm.nih.gov',
	'ncbi.nlm.nih.gov',
	'arxiv.org',
	'plos.org',
	'thelancet.com',
	'nejm.org',
	'wiley.com',
	'tandfonline.com',
	'jamanetwork.com'
];

const OFFICIAL_SUFFIXES = ['.gov', '.gov.uk', '.admin.ch', '.gv.at', '.europa.eu', '.int'];
const OFFICIAL = ['who.int', 'un.org', 'europa.eu', 'bund.de', 'admin.ch', 'oecd.org'];

const NEWS = [
	'reuters.com',
	'apnews.com',
	'bbc.com',
	'bbc.co.uk',
	'nytimes.com',
	'washingtonpost.com',
	'theguardian.com',
	'cnn.com',
	'aljazeera.com',
	'spiegel.de',
	'zeit.de',
	'faz.net',
	'nzz.ch',
	'srf.ch',
	'tagesanzeiger.ch',
	'lemonde.fr',
	'economist.com',
	'ft.com',
	'bloomberg.com'
];

const BLOG = [
	'medium.com',
	'substack.com',
	'wordpress.com',
	'blogspot.com',
	'tumblr.com',
	'dev.to'
];

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
	} catch {
		return null;
	}
}

function matches(host: string, domains: string[]): boolean {
	return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function suggestSourceType(url: string): SourceType {
	const host = hostOf(url);
	if (!host) return 'OTHER';
	if (matches(host, PEER_REVIEWED)) return 'PEER_REVIEWED';
	if (matches(host, OFFICIAL) || OFFICIAL_SUFFIXES.some((s) => host.endsWith(s))) {
		return 'OFFICIAL';
	}
	if (matches(host, NEWS)) return 'NEWS';
	if (matches(host, BLOG)) return 'BLOG';
	return 'OTHER';
}

const CREDIBILITY_KEYS: Record<SourceType, string> = {
	PEER_REVIEWED: 'credibility.peer_reviewed',
	OFFICIAL: 'credibility.official',
	NEWS: 'credibility.news',
	COMPANY: 'credibility.company',
	BLOG: 'credibility.blog',
	OTHER: 'credibility.other'
};

export async function credibilityForType(deps: AuthDeps, type: SourceType): Promise<number> {
	return getConfigNumber(deps, CREDIBILITY_KEYS[type]);
}
