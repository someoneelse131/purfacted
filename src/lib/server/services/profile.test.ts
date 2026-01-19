import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../db', () => ({
	db: {
		user: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn()
		},
		session: {
			deleteMany: vi.fn()
		},
		emailVerification: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		notificationPreference: {
			findMany: vi.fn(),
			upsert: vi.fn()
		}
	}
}));

vi.mock('$lib/utils/crypto', () => ({
	generateUrlSafeToken: vi.fn(() => 'test_token_123')
}));

vi.mock('../mail', () => ({
	sendVerificationEmail: vi.fn().mockResolvedValue(true)
}));

describe('R7: User Profile Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getProfile', () => {
		it('should return user profile', async () => {
			const { db } = await import('../db');
			const { getProfile } = await import('./profile');

			const mockUser = {
				id: 'user123',
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				deletedAt: null
			};

			vi.mocked(db.user.findFirst).mockResolvedValue(mockUser as any);

			const profile = await getProfile('user123');

			expect(profile).toEqual(mockUser);
			expect(db.user.findFirst).toHaveBeenCalledWith({
				where: { id: 'user123', deletedAt: null }
			});
		});

		it('should return null for deleted user', async () => {
			const { db } = await import('../db');
			const { getProfile } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue(null);

			const profile = await getProfile('deleted-user');

			expect(profile).toBeNull();
		});
	});

	describe('updateProfile', () => {
		it('should update user name', async () => {
			const { db } = await import('../db');
			const { updateProfile } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({
				id: 'user123',
				firstName: 'John',
				lastName: 'Doe'
			} as any);

			vi.mocked(db.user.update).mockResolvedValue({
				id: 'user123',
				firstName: 'Jane',
				lastName: 'Smith'
			} as any);

			const result = await updateProfile('user123', {
				firstName: 'Jane',
				lastName: 'Smith'
			});

			expect(result.firstName).toBe('Jane');
			expect(result.lastName).toBe('Smith');
		});

		it('should throw for non-existent user', async () => {
			const { db } = await import('../db');
			const { updateProfile } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue(null);

			await expect(updateProfile('nonexistent', { firstName: 'Test' })).rejects.toMatchObject({
				code: 'USER_NOT_FOUND'
			});
		});

		it('should validate first name', async () => {
			const { db } = await import('../db');
			const { updateProfile } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'user123' } as any);

			await expect(updateProfile('user123', { firstName: 'J' })).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});
	});

	describe('requestEmailChange', () => {
		it('should send verification email for new address', async () => {
			const { db } = await import('../db');
			const { sendVerificationEmail } = await import('../mail');
			const { requestEmailChange } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({
				id: 'user123',
				email: 'old@example.com',
				firstName: 'John'
			} as any);

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await requestEmailChange('user123', 'new@example.com');

			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user123' },
				data: { pendingEmail: 'new@example.com' }
			});
			expect(sendVerificationEmail).toHaveBeenCalled();
		});

		it('should throw if email already exists', async () => {
			const { db } = await import('../db');
			const { requestEmailChange } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({
				id: 'user123',
				email: 'old@example.com'
			} as any);

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'other-user',
				email: 'taken@example.com'
			} as any);

			await expect(requestEmailChange('user123', 'taken@example.com')).rejects.toMatchObject({
				code: 'EMAIL_EXISTS'
			});
		});

		it('should throw if same as current email', async () => {
			const { db } = await import('../db');
			const { requestEmailChange } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({
				id: 'user123',
				email: 'same@example.com'
			} as any);

			await expect(requestEmailChange('user123', 'same@example.com')).rejects.toMatchObject({
				code: 'SAME_EMAIL'
			});
		});
	});

	describe('deleteAccount', () => {
		it('should soft delete user and invalidate sessions', async () => {
			const { db } = await import('../db');
			const { deleteAccount } = await import('./profile');

			vi.mocked(db.user.findFirst).mockResolvedValue({
				id: 'user123',
				deletedAt: null
			} as any);

			await deleteAccount('user123');

			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user123' },
				data: { deletedAt: expect.any(Date) }
			});
			expect(db.session.deleteMany).toHaveBeenCalledWith({
				where: { userId: 'user123' }
			});
		});
	});

	describe('Notification Preferences', () => {
		it('should get notification preferences', async () => {
			const { db } = await import('../db');
			const { getNotificationPreferences } = await import('./profile');

			const mockPreferences = [
				{ type: 'TRUST_CHANGE', email: true, inApp: true },
				{ type: 'FACT_REPLY', email: false, inApp: true }
			];

			vi.mocked(db.notificationPreference.findMany).mockResolvedValue(mockPreferences as any);

			const result = await getNotificationPreferences('user123');

			expect(result).toEqual(mockPreferences);
		});

		it('should upsert notification preference', async () => {
			const { db } = await import('../db');
			const { updateNotificationPreference } = await import('./profile');

			vi.mocked(db.notificationPreference.upsert).mockResolvedValue({
				type: 'TRUST_CHANGE',
				email: false,
				inApp: true
			} as any);

			const result = await updateNotificationPreference('user123', {
				type: 'TRUST_CHANGE' as any,
				email: false,
				inApp: true
			});

			expect(result.email).toBe(false);
			expect(result.inApp).toBe(true);
		});
	});
});
