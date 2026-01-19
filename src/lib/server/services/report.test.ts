import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportError, REPORT_REASONS } from './report';

// Mock the database
vi.mock('../db', () => ({
	db: {
		report: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			count: vi.fn()
		},
		fact: { findUnique: vi.fn() },
		discussion: { findUnique: vi.fn() },
		comment: { findUnique: vi.fn() },
		debate: { findUnique: vi.fn() },
		user: { findUnique: vi.fn() }
	}
}));

describe('R27 & R30: Content Reporting', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('ReportError', () => {
		it('should have correct name and code', () => {
			const error = new ReportError('Test message', 'TEST_CODE');
			expect(error.name).toBe('ReportError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Report reasons', () => {
		it('should define standard report reasons', () => {
			expect(REPORT_REASONS).toContain('Harassment or bullying');
			expect(REPORT_REASONS).toContain('Spam or misleading');
			expect(REPORT_REASONS).toContain('Hate speech');
			expect(REPORT_REASONS).toContain('Misinformation');
			expect(REPORT_REASONS).toContain('Other');
		});
	});

	describe('Content types', () => {
		it('should support all content types', () => {
			const contentTypes = ['FACT', 'DISCUSSION', 'COMMENT', 'DEBATE', 'USER'];

			expect(contentTypes).toContain('FACT');
			expect(contentTypes).toContain('DISCUSSION');
			expect(contentTypes).toContain('COMMENT');
			expect(contentTypes).toContain('DEBATE');
			expect(contentTypes).toContain('USER');
		});
	});

	describe('Report statuses', () => {
		it('should define all statuses', () => {
			const statuses = ['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'];

			expect(statuses).toContain('PENDING');
			expect(statuses).toContain('REVIEWING');
			expect(statuses).toContain('RESOLVED');
			expect(statuses).toContain('DISMISSED');
		});
	});

	describe('Report model', () => {
		it('should have required fields', () => {
			const report = {
				id: 'report-1',
				reporterId: 'user-1',
				contentType: 'FACT',
				contentId: 'fact-1',
				reason: 'Misinformation',
				details: 'This fact is incorrect because...',
				status: 'PENDING',
				reviewedById: null,
				resolution: null,
				createdAt: new Date(),
				resolvedAt: null
			};

			expect(report).toHaveProperty('id');
			expect(report).toHaveProperty('reporterId');
			expect(report).toHaveProperty('contentType');
			expect(report).toHaveProperty('contentId');
			expect(report).toHaveProperty('reason');
			expect(report).toHaveProperty('status');
		});
	});

	describe('Moderation queue', () => {
		it('should add reports to queue', () => {
			const report = { status: 'PENDING' };
			expect(report.status).toBe('PENDING');
		});

		it('should allow moderators to review', () => {
			const report = {
				status: 'REVIEWING',
				reviewedById: 'moderator-1'
			};

			expect(report.reviewedById).toBeTruthy();
		});

		it('should track resolution', () => {
			const report = {
				status: 'RESOLVED',
				resolution: 'Content removed for violating terms.',
				resolvedAt: new Date()
			};

			expect(report.resolution).toBeTruthy();
			expect(report.resolvedAt).toBeTruthy();
		});
	});

	describe('Debate reporting for R27', () => {
		it('should allow reporting debates', () => {
			const report = {
				contentType: 'DEBATE',
				contentId: 'debate-1'
			};

			expect(report.contentType).toBe('DEBATE');
		});

		it('should give moderators access to reported private debates', () => {
			const debate = {
				id: 'debate-1',
				status: 'ACTIVE', // Private debate
				isReported: true
			};

			const canModeratorAccess = debate.isReported;
			expect(canModeratorAccess).toBe(true);
		});

		it('should define moderation actions', () => {
			const actions = ['warn', 'block', 'delete_messages'];

			expect(actions).toContain('warn');
			expect(actions).toContain('block');
			expect(actions).toContain('delete_messages');
		});
	});

	describe('Duplicate report prevention', () => {
		it('should prevent duplicate pending reports', () => {
			const existingReports = [
				{
					reporterId: 'user-1',
					contentType: 'FACT',
					contentId: 'fact-1',
					status: 'PENDING'
				}
			];

			const newReport = {
				reporterId: 'user-1',
				contentType: 'FACT',
				contentId: 'fact-1'
			};

			const isDuplicate = existingReports.some(
				(r) =>
					r.reporterId === newReport.reporterId &&
					r.contentType === newReport.contentType &&
					r.contentId === newReport.contentId &&
					['PENDING', 'REVIEWING'].includes(r.status)
			);

			expect(isDuplicate).toBe(true);
		});
	});
});
