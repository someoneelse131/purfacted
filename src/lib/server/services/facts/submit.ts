import type { Fact, SourceType } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from '../auth/session';
import { getConfigNumber } from '../config';
import { hitRateLimit } from '../rate-limit';
import { credibilityForType } from './source-type';

export type SubmitResult =
	| { ok: true; fact: Fact }
	| { ok: false; error: string; retryAfterSeconds?: number };

const urlSchema = z
	.string()
	.trim()
	.url('Enter a valid URL.')
	.refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'Only http(s) URLs.');

const SOURCE_TYPES: SourceType[] = [
	'PEER_REVIEWED',
	'OFFICIAL',
	'NEWS',
	'COMPANY',
	'BLOG',
	'OTHER'
];

export interface SubmitFactInput {
	userId: string;
	title: string;
	body: string;
	categoryId: string;
	source: { url: string; title: string; type: string };
}

export async function submitFact(deps: AuthDeps, input: SubmitFactInput): Promise<SubmitResult> {
	const [titleMax, bodyMax, maxPerDay, windowDays] = await Promise.all([
		getConfigNumber(deps, 'facts.title_max'),
		getConfigNumber(deps, 'facts.body_max'),
		getConfigNumber(deps, 'facts.max_per_day'),
		getConfigNumber(deps, 'quorum.review_window_days')
	]);

	const title = input.title.trim();
	const body = input.body.trim();
	const sourceTitle = input.source.title.trim();
	if (title.length < 10 || title.length > titleMax) {
		return { ok: false, error: `Title must be 10-${titleMax} characters.` };
	}
	if (body.length === 0 || body.length > bodyMax) {
		return { ok: false, error: `Description must be 1-${bodyMax} characters.` };
	}
	const url = urlSchema.safeParse(input.source.url);
	if (!url.success) return { ok: false, error: url.error.issues[0].message };
	if (sourceTitle.length < 3 || sourceTitle.length > 200) {
		return { ok: false, error: 'Source title must be 3-200 characters.' };
	}
	if (!SOURCE_TYPES.includes(input.source.type as SourceType)) {
		return { ok: false, error: 'Invalid source type.' };
	}
	const type = input.source.type as SourceType;

	const category = await deps.prisma.category.findFirst({
		where: { id: input.categoryId, status: 'ACTIVE' }
	});
	if (!category) return { ok: false, error: 'Choose a valid category.' };

	const limit = await hitRateLimit(deps.redis, `fact-submit:${input.userId}`, maxPerDay, 86_400);
	if (!limit.allowed) {
		return {
			ok: false,
			error: 'Daily submission limit reached. Try again tomorrow.',
			retryAfterSeconds: limit.retryAfterSeconds
		};
	}

	const credibility = await credibilityForType(deps, type);
	const fact = await deps.prisma.fact.create({
		data: {
			title,
			body,
			authorId: input.userId,
			categoryId: category.id,
			reviewDeadline: new Date(Date.now() + windowDays * 86_400_000),
			sources: {
				create: {
					side: 'PRO',
					url: url.data,
					title: sourceTitle,
					type,
					credibility,
					addedById: input.userId
				}
			}
		}
	});
	return { ok: true, fact };
}
