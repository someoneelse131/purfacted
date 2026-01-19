import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		passwordReset: {
			create: vi.fn(),
			findUnique: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		session: {
			deleteMany: vi.fn()
		}
	}
}));

vi.mock('$lib/utils/crypto', () => ({
	hashPassword: vi.fn(async (p: string) => `hashed_${p}`),
	verifyPassword: vi.fn(async (p: string, h: string) => h === `hashed_${p}`),
	generateUrlSafeToken: vi.fn(() => 'test_token_123')
}));

vi.mock('../rateLimit', () => ({
	checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 2, resetInSeconds: 3600 }))
}));

describe('R5: Password Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('requestPasswordReset', () => {
		it('should create reset token for existing user', async () => {
			const { db } = await import('../db');
			const { requestPasswordReset } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user123',
				email: 'test@example.com',
				passwordHash: 'hash'
			} as any);

			const token = await requestPasswordReset('test@example.com');

			expect(token).toBe('test_token_123');
			expect(db.passwordReset.deleteMany).toHaveBeenCalledWith({
				where: { userId: 'user123' }
			});
			expect(db.passwordReset.create).toHaveBeenCalled();
		});

		it('should return null for non-existent user', async () => {
			const { db } = await import('../db');
			const { requestPasswordReset } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			const token = await requestPasswordReset('nonexistent@example.com');

			expect(token).toBeNull();
			expect(db.passwordReset.create).not.toHaveBeenCalled();
		});

		it('should throw on rate limit exceeded', async () => {
			const { checkRateLimit } = await import('../rateLimit');
			const { requestPasswordReset } = await import('./password');

			vi.mocked(checkRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetInSeconds: 1800
			});

			await expect(requestPasswordReset('test@example.com')).rejects.toMatchObject({
				code: 'RATE_LIMITED'
			});
		});
	});

	describe('resetPassword', () => {
		it('should reset password with valid token', async () => {
			const { db } = await import('../db');
			const { resetPassword } = await import('./password');

			vi.mocked(db.passwordReset.findUnique).mockResolvedValue({
				id: 'reset123',
				token: 'valid_token',
				userId: 'user123',
				expiresAt: new Date(Date.now() + 3600000),
				user: {
					id: 'user123',
					passwordHash: 'hashed_oldpassword'
				}
			} as any);

			await resetPassword('valid_token', 'NewPassword1!');

			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user123' },
				data: { passwordHash: 'hashed_NewPassword1!' }
			});
			expect(db.passwordReset.delete).toHaveBeenCalledWith({
				where: { id: 'reset123' }
			});
			expect(db.session.deleteMany).toHaveBeenCalledWith({
				where: { userId: 'user123' }
			});
		});

		it('should throw on invalid token', async () => {
			const { db } = await import('../db');
			const { resetPassword } = await import('./password');

			vi.mocked(db.passwordReset.findUnique).mockResolvedValue(null);

			await expect(resetPassword('invalid_token', 'NewPassword1!')).rejects.toMatchObject({
				code: 'INVALID_TOKEN'
			});
		});

		it('should throw on expired token', async () => {
			const { db } = await import('../db');
			const { resetPassword } = await import('./password');

			vi.mocked(db.passwordReset.findUnique).mockResolvedValue({
				id: 'reset123',
				token: 'expired_token',
				userId: 'user123',
				expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
				user: {
					id: 'user123',
					passwordHash: 'old_hash'
				}
			} as any);

			await expect(resetPassword('expired_token', 'NewPassword1!')).rejects.toMatchObject({
				code: 'TOKEN_EXPIRED'
			});
		});

		it('should throw on weak password', async () => {
			const { resetPassword } = await import('./password');

			await expect(resetPassword('any_token', 'weak')).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});
	});

	describe('changePassword', () => {
		it('should change password with correct current password', async () => {
			const { db } = await import('../db');
			const { changePassword } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user123',
				passwordHash: 'hashed_OldPassword1!'
			} as any);

			await changePassword('user123', 'OldPassword1!', 'NewPassword1!');

			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user123' },
				data: { passwordHash: 'hashed_NewPassword1!' }
			});
		});

		it('should throw on wrong current password', async () => {
			const { db } = await import('../db');
			const { changePassword } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user123',
				passwordHash: 'hashed_CorrectPassword1!'
			} as any);

			await expect(
				changePassword('user123', 'WrongPassword1!', 'NewPassword1!')
			).rejects.toMatchObject({
				code: 'WRONG_CURRENT_PASSWORD'
			});
		});

		it('should throw if new password same as current', async () => {
			const { db } = await import('../db');
			const { changePassword } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user123',
				passwordHash: 'hashed_SamePassword1!'
			} as any);

			await expect(
				changePassword('user123', 'SamePassword1!', 'SamePassword1!')
			).rejects.toMatchObject({
				code: 'SAME_PASSWORD'
			});
		});

		it('should throw for non-existent user', async () => {
			const { db } = await import('../db');
			const { changePassword } = await import('./password');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await expect(
				changePassword('nonexistent', 'Old1!', 'New1!')
			).rejects.toMatchObject({
				code: 'USER_NOT_FOUND'
			});
		});
	});
});
