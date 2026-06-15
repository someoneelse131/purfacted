import { describe, expect, it } from 'vitest';
import { activitySummary, HOME_FEED_TYPES, toHomeFeedItem } from './home-feed';

describe('activitySummary', () => {
	it('describes each home-feed event type', () => {
		expect(activitySummary('fact_submitted', {})).toBe('submitted a new claim');
		expect(activitySummary('source_added', { side: 'PRO' })).toBe('added supporting evidence');
		expect(activitySummary('source_added', { side: 'CONTRA' })).toBe('added opposing evidence');
		expect(activitySummary('fact_decided', { status: 'VERIFIED' })).toBe('was verified');
		expect(activitySummary('fact_decided', { status: 'DISPUTED' })).toBe('was disputed');
		expect(activitySummary('fact_decided', { status: 'REFUTED' })).toBe('was refuted');
		expect(activitySummary('veto_opened', { previousStatus: 'VERIFIED' })).toBe(
			'was contested by a veto'
		);
		expect(activitySummary('veto_resolved', { outcome: 'SUCCEEDED' })).toBe(
			'veto upheld - status changed'
		);
		expect(activitySummary('veto_resolved', { outcome: 'FAILED' })).toBe('veto dismissed');
	});

	it('distinguishes an unsubstantiated expiry from a restore', () => {
		expect(activitySummary('fact_status_changed', { status: 'UNSUBSTANTIATED' })).toBe(
			'became unsubstantiated (no quorum)'
		);
		expect(activitySummary('fact_status_changed', { status: 'VERIFIED', restored: true })).toBe(
			'returned to its previous status'
		);
	});

	it('never throws on a missing or unknown payload', () => {
		expect(activitySummary('fact_decided', null)).toBe('was decided');
		expect(activitySummary('fact_decided', undefined)).toBe('was decided');
		expect(activitySummary('fact_submitted', { junk: 1 })).toBe('submitted a new claim');
	});
});

describe('HOME_FEED_TYPES', () => {
	it('covers new claims, evidence, status changes and vetoes, not comments/badges', () => {
		expect(HOME_FEED_TYPES).toContain('fact_submitted');
		expect(HOME_FEED_TYPES).toContain('fact_decided');
		expect(HOME_FEED_TYPES).toContain('veto_opened');
		expect(HOME_FEED_TYPES).not.toContain('comment_added');
		expect(HOME_FEED_TYPES).not.toContain('badge_earned');
	});
});

describe('toHomeFeedItem', () => {
	const base = {
		id: 'evt1',
		type: 'fact_submitted',
		subjectType: 'FACT',
		subjectId: 'f1',
		actorId: 'u1',
		factId: 'f1',
		categoryId: 'c1',
		payload: {},
		createdAt: new Date('2026-06-15T10:00:00Z')
	};

	it('joins actor, fact and category into a linkable item', () => {
		const item = toHomeFeedItem({
			...base,
			actor: { username: 'alice', deletedAt: null },
			fact: { id: 'f1', title: 'The earth is round', deletedAt: null },
			category: { name: 'Science', slug: 'science' }
		} as never);
		expect(item).toMatchObject({
			actorUsername: 'alice',
			factId: 'f1',
			factTitle: 'The earth is round',
			categoryName: 'Science',
			categorySlug: 'science',
			summary: 'submitted a new claim'
		});
	});

	it('anonymizes a soft-deleted actor and drops a soft-deleted fact link', () => {
		const item = toHomeFeedItem({
			...base,
			actor: { username: 'gone', deletedAt: new Date() },
			fact: { id: 'f1', title: 'Removed', deletedAt: new Date() },
			category: { name: 'Science', slug: 'science' }
		} as never);
		expect(item.actorUsername).toBeNull();
		expect(item.factId).toBeNull();
		expect(item.factTitle).toBeNull();
	});

	it('handles system events with no actor', () => {
		const item = toHomeFeedItem({
			...base,
			type: 'fact_decided',
			actorId: null,
			payload: { status: 'VERIFIED' },
			actor: null,
			fact: { id: 'f1', title: 'Decided fact', deletedAt: null },
			category: { name: 'Science', slug: 'science' }
		} as never);
		expect(item.actorUsername).toBeNull();
		expect(item.summary).toBe('was verified');
	});
});
