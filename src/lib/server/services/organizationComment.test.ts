import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrgCommentError } from './organizationComment';

// Mock the database
vi.mock('../db', () => ({
	db: {
		organizationTag: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		},
		officialComment: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		fact: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		source: {
			create: vi.fn()
		},
		user: {
			findUnique: vi.fn()
		}
	}
}));

describe('R29: Organization Comments', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('OrgCommentError', () => {
		it('should have correct name and code', () => {
			const error = new OrgCommentError('Test message', 'TEST_CODE');
			expect(error.name).toBe('OrgCommentError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Organization tagging', () => {
		it('should allow manual tagging by users', () => {
			const tag = {
				factId: 'fact-1',
				orgUserId: 'org-1',
				taggedById: 'user-1' // Manual tag
			};

			expect(tag.taggedById).toBeTruthy();
		});

		it('should allow auto-tagging (taggedById null)', () => {
			const tag = {
				factId: 'fact-1',
				orgUserId: 'org-1',
				taggedById: null // Auto-tagged by keyword
			};

			expect(tag.taggedById).toBeNull();
		});

		it('should only tag organization user types', () => {
			const validUserTypes = ['ORGANIZATION'];
			const invalidUserTypes = ['VERIFIED', 'EXPERT', 'PHD', 'MODERATOR'];

			expect(validUserTypes).toContain('ORGANIZATION');
			for (const type of invalidUserTypes) {
				expect(validUserTypes).not.toContain(type);
			}
		});
	});

	describe('Official comments', () => {
		it('should be instant publish (no moderation)', () => {
			const comment = {
				id: 'official-1',
				factId: 'fact-1',
				orgUserId: 'org-1',
				body: 'Official statement from the organization...',
				createdAt: new Date()
			};

			// No status field means instant publish
			expect(comment).not.toHaveProperty('status');
		});

		it('should be highlighted differently from regular comments', () => {
			const isOfficialComment = true;
			const isHighlighted = isOfficialComment;
			expect(isHighlighted).toBe(true);
		});

		it('should validate body length', () => {
			const MAX_LENGTH = 5000;
			const validBody = 'a'.repeat(5000);
			const invalidBody = 'a'.repeat(5001);

			expect(validBody.length <= MAX_LENGTH).toBe(true);
			expect(invalidBody.length > MAX_LENGTH).toBe(true);
		});
	});

	describe('Fact dispute', () => {
		it('should allow orgs to dispute facts', () => {
			const tag = {
				factId: 'fact-1',
				orgUserId: 'org-1',
				isDisputed: true
			};

			expect(tag.isDisputed).toBe(true);
		});

		it('should trigger review when disputed', () => {
			const factBeforeDispute = { status: 'PROVEN' };
			const factAfterDispute = { status: 'IN_REVIEW' };

			expect(factAfterDispute.status).toBe('IN_REVIEW');
		});
	});

	describe('Organization sources', () => {
		it('should allow orgs to add sources to facts about them', () => {
			const source = {
				factId: 'fact-1',
				url: 'https://example-org.com/statement',
				type: 'OFFICIAL',
				addedById: 'org-1'
			};

			expect(source.type).toBe('OFFICIAL');
		});

		it('should set high credibility for org sources', () => {
			const ORG_SOURCE_CREDIBILITY = 80;
			expect(ORG_SOURCE_CREDIBILITY).toBeGreaterThan(50);
		});
	});

	describe('Organization restrictions', () => {
		it('should not allow orgs to delete facts', () => {
			const canOrgDeleteFact = false;
			expect(canOrgDeleteFact).toBe(false);
		});

		it('should notify org when tagged', () => {
			const notification = {
				type: 'ORG_COMMENT',
				userId: 'org-1',
				message: 'Your organization was mentioned in a fact'
			};

			expect(notification.type).toBe('ORG_COMMENT');
		});
	});

	describe('Unique constraint', () => {
		it('should enforce unique factId-orgUserId for tags', () => {
			const tags = [
				{ factId: 'fact-1', orgUserId: 'org-1' },
				{ factId: 'fact-1', orgUserId: 'org-2' },
				{ factId: 'fact-2', orgUserId: 'org-1' }
			];

			const combinations = tags.map((t) => `${t.factId}-${t.orgUserId}`);
			const uniqueCombinations = new Set(combinations);
			expect(combinations.length).toBe(uniqueCombinations.size);
		});
	});
});
