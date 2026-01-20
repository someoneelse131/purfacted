import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		},
		emailVerification: {
			findUnique: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		}
	}
}));

vi.mock('$lib/utils/crypto', () => ({
	hashPassword: vi.fn().mockResolvedValue('hashed_password'),
	generateUrlSafeToken: vi.fn().mockReturnValue('test_verification_token')
}));

vi.mock('$lib/utils/disposableEmail', () => ({
	validateNotDisposable: vi.fn().mockResolvedValue(undefined)
}));

describe('T6: User Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('registerUser', () => {
		const validInput = {
			email: 'test@example.com',
			firstName: 'John',
			lastName: 'Doe',
			password: 'SecurePass123!'
		};

		it('should register a new user with valid input', async () => {
			const { db } = await import('../db');
			const { registerUser } = await import('./user');

			const mockUser = {
				id: 'user-123',
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				passwordHash: 'hashed_password',
				trustScore: 10,
				emailVerified: false,
				userType: 'VERIFIED',
				banLevel: 0,
				bannedUntil: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				lastLoginAt: null,
				deletedAt: null
			};

			vi.mocked(db.user.findUnique).mockResolvedValue(null);
			vi.mocked(db.user.create).mockResolvedValue(mockUser);
			vi.mocked(db.emailVerification.create).mockResolvedValue({
				id: 'verification-1',
				token: 'test_verification_token',
				userId: 'user-123',
				expiresAt: new Date(Date.now() + 86400000)
			});

			const result = await registerUser(validInput);

			expect(result.user).toEqual(mockUser);
			expect(result.verificationToken).toBe('test_verification_token');
			expect(db.user.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					email: 'test@example.com',
					firstName: 'John',
					lastName: 'Doe',
					trustScore: 10,
					emailVerified: false
				})
			});
		});

		it('should lowercase the email address', async () => {
			const { db } = await import('../db');
			const { registerUser } = await import('./user');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);
			vi.mocked(db.user.create).mockResolvedValue({
				id: 'user-123',
				email: 'test@example.com'
			} as any);
			vi.mocked(db.emailVerification.create).mockResolvedValue({} as any);

			await registerUser({
				...validInput,
				email: 'TEST@EXAMPLE.COM'
			});

			expect(db.user.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					email: 'test@example.com'
				})
			});
		});

		it('should trim whitespace from names', async () => {
			const { db } = await import('../db');
			const { registerUser } = await import('./user');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);
			vi.mocked(db.user.create).mockResolvedValue({
				id: 'user-123'
			} as any);
			vi.mocked(db.emailVerification.create).mockResolvedValue({} as any);

			await registerUser({
				...validInput,
				firstName: '  John  ',
				lastName: '  Doe  '
			});

			expect(db.user.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					firstName: 'John',
					lastName: 'Doe'
				})
			});
		});

		it('should throw validation error for missing email', async () => {
			const { registerUser } = await import('./user');

			await expect(
				registerUser({
					...validInput,
					email: ''
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				message: 'Validation failed'
			});
		});

		it('should throw validation error for invalid email format', async () => {
			const { registerUser } = await import('./user');

			await expect(
				registerUser({
					...validInput,
					email: 'not-an-email'
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});

		it('should throw validation error for short password', async () => {
			const { registerUser } = await import('./user');

			await expect(
				registerUser({
					...validInput,
					password: 'Short1!'
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});

		it('should throw validation error for password without number', async () => {
			const { registerUser } = await import('./user');

			await expect(
				registerUser({
					...validInput,
					password: 'NoNumberHere!'
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});

		it('should throw validation error for password without special character', async () => {
			const { registerUser } = await import('./user');

			await expect(
				registerUser({
					...validInput,
					password: 'NoSpecial123'
				})
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR'
			});
		});

		it('should throw error for disposable email', async () => {
			const { validateNotDisposable } = await import('$lib/utils/disposableEmail');
			const { registerUser } = await import('./user');

			vi.mocked(validateNotDisposable).mockRejectedValueOnce({
				code: 'DISPOSABLE_EMAIL',
				message: 'Disposable email addresses are not allowed'
			});

			await expect(registerUser(validInput)).rejects.toMatchObject({
				code: 'DISPOSABLE_EMAIL'
			});
		});

		it('should throw error for existing email', async () => {
			const { db } = await import('../db');
			const { validateNotDisposable } = await import('$lib/utils/disposableEmail');
			const { registerUser } = await import('./user');

			// Ensure disposable email validation passes
			vi.mocked(validateNotDisposable).mockResolvedValueOnce(undefined);

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'existing-user',
				email: 'test@example.com'
			} as any);

			await expect(registerUser(validInput)).rejects.toMatchObject({
				code: 'EMAIL_EXISTS',
				message: 'An account with this email already exists'
			});
		});

		it('should create email verification token', async () => {
			const { db } = await import('../db');
			const { validateNotDisposable } = await import('$lib/utils/disposableEmail');
			const { generateUrlSafeToken } = await import('$lib/utils/crypto');
			const { registerUser } = await import('./user');

			// Ensure disposable email validation passes
			vi.mocked(validateNotDisposable).mockResolvedValueOnce(undefined);
			vi.mocked(generateUrlSafeToken).mockReturnValue('test_verification_token');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);
			vi.mocked(db.user.create).mockResolvedValue({
				id: 'user-123'
			} as any);
			vi.mocked(db.emailVerification.create).mockResolvedValue({} as any);

			await registerUser(validInput);

			expect(db.emailVerification.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					token: 'test_verification_token',
					userId: 'user-123'
				})
			});
		});
	});

	describe('verifyEmail', () => {
		it('should verify user with valid token', async () => {
			const { db } = await import('../db');
			const { verifyEmail } = await import('./user');

			const mockUser = {
				id: 'user-123',
				email: 'test@example.com',
				emailVerified: true
			};

			vi.mocked(db.emailVerification.findUnique).mockResolvedValue({
				id: 'verification-1',
				token: 'valid_token',
				userId: 'user-123',
				expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
				user: { id: 'user-123', email: 'test@example.com' }
			} as any);

			vi.mocked(db.user.update).mockResolvedValue(mockUser as any);
			vi.mocked(db.emailVerification.delete).mockResolvedValue({} as any);

			const result = await verifyEmail('valid_token');

			expect(result).toEqual(mockUser);
			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user-123' },
				data: { emailVerified: true }
			});
			expect(db.emailVerification.delete).toHaveBeenCalled();
		});

		it('should return null for invalid token', async () => {
			const { db } = await import('../db');
			const { verifyEmail } = await import('./user');

			vi.mocked(db.emailVerification.findUnique).mockResolvedValue(null);

			const result = await verifyEmail('invalid_token');

			expect(result).toBeNull();
			expect(db.user.update).not.toHaveBeenCalled();
		});

		it('should return null for expired token', async () => {
			const { db } = await import('../db');
			const { verifyEmail } = await import('./user');

			vi.mocked(db.emailVerification.findUnique).mockResolvedValue({
				id: 'verification-1',
				token: 'expired_token',
				userId: 'user-123',
				expiresAt: new Date(Date.now() - 86400000), // 24 hours ago
				user: { id: 'user-123' }
			} as any);

			vi.mocked(db.emailVerification.delete).mockResolvedValue({} as any);

			const result = await verifyEmail('expired_token');

			expect(result).toBeNull();
			expect(db.emailVerification.delete).toHaveBeenCalledWith({
				where: { id: 'verification-1' }
			});
			expect(db.user.update).not.toHaveBeenCalled();
		});

		it('should delete verification token after successful verification', async () => {
			const { db } = await import('../db');
			const { verifyEmail } = await import('./user');

			vi.mocked(db.emailVerification.findUnique).mockResolvedValue({
				id: 'verification-1',
				token: 'valid_token',
				userId: 'user-123',
				expiresAt: new Date(Date.now() + 86400000),
				user: { id: 'user-123' }
			} as any);

			vi.mocked(db.user.update).mockResolvedValue({ id: 'user-123' } as any);
			vi.mocked(db.emailVerification.delete).mockResolvedValue({} as any);

			await verifyEmail('valid_token');

			expect(db.emailVerification.delete).toHaveBeenCalledWith({
				where: { id: 'verification-1' }
			});
		});
	});

	describe('getUserById', () => {
		it('should return user when found', async () => {
			const { db } = await import('../db');
			const { getUserById } = await import('./user');

			const mockUser = {
				id: 'user-123',
				email: 'test@example.com'
			};

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);

			const result = await getUserById('user-123');

			expect(result).toEqual(mockUser);
			expect(db.user.findUnique).toHaveBeenCalledWith({
				where: { id: 'user-123' }
			});
		});

		it('should return null when user not found', async () => {
			const { db } = await import('../db');
			const { getUserById } = await import('./user');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			const result = await getUserById('nonexistent-id');

			expect(result).toBeNull();
		});
	});

	describe('getUserByEmail', () => {
		it('should return user when found', async () => {
			const { db } = await import('../db');
			const { getUserByEmail } = await import('./user');

			const mockUser = {
				id: 'user-123',
				email: 'test@example.com'
			};

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);

			const result = await getUserByEmail('test@example.com');

			expect(result).toEqual(mockUser);
		});

		it('should be case insensitive', async () => {
			const { db } = await import('../db');
			const { getUserByEmail } = await import('./user');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await getUserByEmail('TEST@EXAMPLE.COM');

			expect(db.user.findUnique).toHaveBeenCalledWith({
				where: { email: 'test@example.com' }
			});
		});

		it('should return null when user not found', async () => {
			const { db } = await import('../db');
			const { getUserByEmail } = await import('./user');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			const result = await getUserByEmail('nonexistent@example.com');

			expect(result).toBeNull();
		});
	});

	describe('updateLastLogin', () => {
		it('should update last login timestamp', async () => {
			const { db } = await import('../db');
			const { updateLastLogin } = await import('./user');

			vi.mocked(db.user.update).mockResolvedValue({} as any);

			await updateLastLogin('user-123');

			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user-123' },
				data: { lastLoginAt: expect.any(Date) }
			});
		});
	});

	describe('isUserBanned', () => {
		it('should return false for unbanned user (banLevel 0)', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 0,
				bannedUntil: null
			} as any;

			expect(isUserBanned(user)).toBe(false);
		});

		it('should return false when bannedUntil is null', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 1,
				bannedUntil: null
			} as any;

			expect(isUserBanned(user)).toBe(false);
		});

		it('should return true for permanently banned user (banLevel >= 3)', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 3,
				bannedUntil: new Date(Date.now() + 86400000)
			} as any;

			expect(isUserBanned(user)).toBe(true);
		});

		it('should return true for active temporary ban', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 1,
				bannedUntil: new Date(Date.now() + 86400000) // Tomorrow
			} as any;

			expect(isUserBanned(user)).toBe(true);
		});

		it('should return false for expired temporary ban', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 1,
				bannedUntil: new Date(Date.now() - 86400000) // Yesterday
			} as any;

			expect(isUserBanned(user)).toBe(false);
		});

		it('should return true for second offense ban (banLevel 2)', async () => {
			const { isUserBanned } = await import('./user');

			const user = {
				id: 'user-123',
				banLevel: 2,
				bannedUntil: new Date(Date.now() + 86400000)
			} as any;

			expect(isUserBanned(user)).toBe(true);
		});
	});
});
