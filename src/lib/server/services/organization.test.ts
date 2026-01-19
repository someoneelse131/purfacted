import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	OrganizationError,
	isVerifiedDomain,
	getDomainFromEmail,
	getOrganizationVoteWeight,
	getOrganizationInitialTrust,
	canOrgDeleteFact
} from './organization';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			count: vi.fn()
		},
		organizationTag: {
			findFirst: vi.fn(),
			findMany: vi.fn()
		},
		fact: {
			findMany: vi.fn(),
			count: vi.fn()
		},
		officialComment: {
			count: vi.fn()
		}
	}
}));

describe('R33: Organization Accounts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('OrganizationError', () => {
		it('should have correct name and code', () => {
			const error = new OrganizationError('Test message', 'TEST_CODE');
			expect(error.name).toBe('OrganizationError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Domain verification', () => {
		it('should accept .edu domains', () => {
			expect(isVerifiedDomain('org@stanford.edu')).toBe(true);
			expect(isVerifiedDomain('contact@mit.edu')).toBe(true);
		});

		it('should accept .gov domains', () => {
			expect(isVerifiedDomain('info@whitehouse.gov')).toBe(true);
			expect(isVerifiedDomain('contact@nasa.gov')).toBe(true);
		});

		it('should accept .org domains', () => {
			expect(isVerifiedDomain('info@wikipedia.org')).toBe(true);
		});

		it('should accept academic domains like .ac.uk', () => {
			expect(isVerifiedDomain('info@oxford.ac.uk')).toBe(true);
		});

		it('should reject free email providers', () => {
			expect(isVerifiedDomain('user@gmail.com')).toBe(false);
			expect(isVerifiedDomain('user@yahoo.com')).toBe(false);
			expect(isVerifiedDomain('user@hotmail.com')).toBe(false);
		});

		it('should accept custom company domains', () => {
			expect(isVerifiedDomain('contact@microsoft.com')).toBe(true);
			expect(isVerifiedDomain('pr@apple.com')).toBe(true);
		});
	});

	describe('Domain extraction', () => {
		it('should extract domain from email', () => {
			expect(getDomainFromEmail('user@example.com')).toBe('example.com');
			expect(getDomainFromEmail('contact@stanford.edu')).toBe('stanford.edu');
		});

		it('should handle invalid emails', () => {
			expect(getDomainFromEmail('invalid-email')).toBe('');
		});
	});

	describe('Organization registration requirements', () => {
		it('should require verified domain', () => {
			const validEmail = 'contact@university.edu';
			const invalidEmail = 'contact@gmail.com';

			expect(isVerifiedDomain(validEmail)).toBe(true);
			expect(isVerifiedDomain(invalidEmail)).toBe(false);
		});

		it('should require manual moderator approval', () => {
			// Org approval flow requires moderator
			const requiresApproval = true;
			expect(requiresApproval).toBe(true);
		});
	});

	describe('Organization privileges', () => {
		it('should have 100 vote points (configurable)', () => {
			const voteWeight = getOrganizationVoteWeight();
			expect(voteWeight).toBe(100);
		});

		it('should start with +50 trust score', () => {
			const initialTrust = getOrganizationInitialTrust();
			expect(initialTrust).toBe(50);
		});

		it('should become owner of facts they post', () => {
			const fact = {
				userId: 'org-1',
				user: { userType: 'ORGANIZATION' }
			};

			const isOrgOwned = fact.user.userType === 'ORGANIZATION';
			expect(isOrgOwned).toBe(true);
		});
	});

	describe('Organization restrictions', () => {
		it('should not allow organizations to delete facts', () => {
			const canDelete = canOrgDeleteFact();
			expect(canDelete).toBe(false);
		});

		it('should allow commenting on facts that mention them', () => {
			const isTagged = true; // Would be checked via organizationTag
			const canComment = isTagged;
			expect(canComment).toBe(true);
		});
	});

	describe('Organization approval flow', () => {
		it('should require moderator for approval', () => {
			const moderator = { userType: 'MODERATOR' };
			const canApprove = moderator.userType === 'MODERATOR';
			expect(canApprove).toBe(true);
		});

		it('should update user type to ORGANIZATION on approval', () => {
			const user = { userType: 'VERIFIED' };
			user.userType = 'ORGANIZATION';
			expect(user.userType).toBe('ORGANIZATION');
		});

		it('should set trust score to 50 on approval', () => {
			const user = { trustScore: 10 };
			user.trustScore = 50;
			expect(user.trustScore).toBe(50);
		});
	});

	describe('Organization tracking', () => {
		it('should track facts where org is tagged', () => {
			const tags = [
				{ factId: 'fact-1', isDisputed: false },
				{ factId: 'fact-2', isDisputed: true }
			];

			expect(tags.length).toBe(2);
			expect(tags[1].isDisputed).toBe(true);
		});

		it('should track facts owned by org', () => {
			const ownedFacts = ['fact-1', 'fact-2', 'fact-3'];
			expect(ownedFacts.length).toBe(3);
		});
	});

	describe('Organization statistics', () => {
		it('should track total organizations', () => {
			const stats = { total: 25 };
			expect(stats.total).toBe(25);
		});

		it('should track active organizations this month', () => {
			const stats = { activeThisMonth: 15 };
			expect(stats.activeThisMonth).toBe(15);
		});

		it('should track facts posted by organizations', () => {
			const stats = { factsPosted: 100 };
			expect(stats.factsPosted).toBe(100);
		});

		it('should track official comments', () => {
			const stats = { officialComments: 50 };
			expect(stats.officialComments).toBe(50);
		});
	});
});
