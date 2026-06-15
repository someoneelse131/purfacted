import { describe, expect, it } from 'vitest';
import {
	notificationChannel,
	notificationLink,
	notificationSummary,
	toView
} from './notifications';

describe('notificationSummary', () => {
	it('describes each notification type', () => {
		expect(notificationSummary('fact_decided', { status: 'VERIFIED' })).toBe(
			'Your claim was verified'
		);
		expect(notificationSummary('fact_decided', { status: 'REFUTED' })).toBe(
			'Your claim was refuted'
		);
		expect(notificationSummary('veto_received', {})).toBe('Your claim was contested by a veto');
		expect(notificationSummary('comment_reply', {})).toBe('Someone replied to your comment');
		expect(notificationSummary('badge_earned', { badgeName: 'Source Hunter' })).toBe(
			'You earned the "Source Hunter" badge'
		);
		expect(notificationSummary('moderation_outcome', { outcome: 'removed' })).toBe(
			'A report you filed led to content being removed'
		);
		expect(notificationSummary('moderation_outcome', { outcome: 'dismissed' })).toBe(
			'A report you filed was reviewed'
		);
	});

	it('never throws on a missing or partial payload', () => {
		expect(notificationSummary('fact_decided', null)).toBe('Your claim was decided');
		expect(notificationSummary('badge_earned', undefined)).toBe('You earned a new badge');
	});
});

describe('notificationLink', () => {
	it('links to the fact when present, otherwise home', () => {
		expect(notificationLink({ factId: 'abc' })).toBe('/facts/abc');
		expect(notificationLink({ factId: null })).toBe('/');
	});
});

describe('notificationChannel', () => {
	it('namespaces per user', () => {
		expect(notificationChannel('u1')).toBe('notif:u1');
	});
});

describe('toView', () => {
	it('maps a row into the client shape with read state and an ISO date', () => {
		const view = toView({
			id: 'n1',
			userId: 'u1',
			type: 'fact_decided',
			factId: 'f1',
			subjectId: 'f1',
			payload: { status: 'VERIFIED' },
			readAt: null,
			createdAt: new Date('2026-06-15T10:00:00Z')
		} as never);
		expect(view).toEqual({
			id: 'n1',
			type: 'fact_decided',
			summary: 'Your claim was verified',
			link: '/facts/f1',
			read: false,
			createdAt: '2026-06-15T10:00:00.000Z'
		});
	});

	it('reflects a read notification', () => {
		const view = toView({
			id: 'n2',
			userId: 'u1',
			type: 'comment_reply',
			factId: 'f2',
			subjectId: 'c1',
			payload: {},
			readAt: new Date(),
			createdAt: new Date('2026-06-15T11:00:00Z')
		} as never);
		expect(view.read).toBe(true);
	});
});
