/**
 * R49: Seed Data
 *
 * Creates essential data for the platform.
 * Run with: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const prisma = new PrismaClient();

// Default password for all seed users
const DEFAULT_PASSWORD = 'Test123!@#';

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(32);
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

async function main() {
	console.log('🌱 Starting seed...');

	const passwordHash = await hashPassword(DEFAULT_PASSWORD);

	// ====================================
	// Create Admin/Moderator User
	// ====================================
	console.log('Creating admin user...');

	const adminUser = await prisma.user.upsert({
		where: { email: 'admin@purfacted.com' },
		update: {},
		create: {
			email: 'admin@purfacted.com',
			firstName: 'Admin',
			lastName: 'User',
			passwordHash,
			emailVerified: true,
			userType: 'MODERATOR',
			trustScore: 100
		}
	});

	console.log('✅ Created admin user');

	// ====================================
	// Create Categories
	// ====================================
	console.log('Creating categories...');

	const categoryNames = [
		'Science',
		'Health',
		'Technology',
		'Environment',
		'History',
		'Politics',
		'Economics',
		'Sports',
		'Entertainment',
		'Education',
		'General'
	];

	for (const name of categoryNames) {
		await prisma.category.upsert({
			where: { name },
			update: {},
			create: {
				name,
				createdBy: { connect: { id: adminUser.id } }
			}
		});
	}

	console.log(`✅ Created ${categoryNames.length} categories`);

	// ====================================
	// Create Trust Score Config
	// ====================================
	console.log('Creating trust score configuration...');

	const trustConfigs = [
		{ action: 'FACT_APPROVED', points: 10 },
		{ action: 'FACT_WRONG', points: -20 },
		{ action: 'FACT_OUTDATED', points: 0 },
		{ action: 'VETO_SUCCESS', points: 5 },
		{ action: 'VETO_FAIL', points: -5 },
		{ action: 'VERIFICATION_CORRECT', points: 3 },
		{ action: 'VERIFICATION_WRONG', points: -10 },
		{ action: 'UPVOTED', points: 1 },
		{ action: 'DOWNVOTED', points: -1 }
	];

	for (const config of trustConfigs) {
		await prisma.trustScoreConfig.upsert({
			where: { action: config.action as any },
			update: { points: config.points },
			create: { action: config.action as any, points: config.points }
		});
	}

	// Vote weight configs
	const voteWeights = [
		{ userType: 'ANONYMOUS', baseWeight: 0.1 },
		{ userType: 'VERIFIED', baseWeight: 2 },
		{ userType: 'EXPERT', baseWeight: 5 },
		{ userType: 'PHD', baseWeight: 8 },
		{ userType: 'ORGANIZATION', baseWeight: 100 },
		{ userType: 'MODERATOR', baseWeight: 3 }
	];

	for (const config of voteWeights) {
		await prisma.voteWeightConfig.upsert({
			where: { userType: config.userType as any },
			update: { baseWeight: config.baseWeight },
			create: { userType: config.userType as any, baseWeight: config.baseWeight }
		});
	}

	// Trust modifiers - delete existing and recreate
	await prisma.trustModifierConfig.deleteMany({});

	const trustModifiers = [
		{ minTrust: 100, maxTrust: null, modifier: 1.5 },
		{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
		{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
		{ minTrust: -25, maxTrust: -1, modifier: 0.5 },
		{ minTrust: -50, maxTrust: -26, modifier: 0.25 },
		{ minTrust: -999, maxTrust: -51, modifier: 0 }
	];

	for (const mod of trustModifiers) {
		await prisma.trustModifierConfig.create({
			data: mod
		});
	}

	console.log('✅ Created configuration');

	console.log('\n🎉 Seed completed successfully!');
	console.log('\nAdmin user (password: Test123!@#):');
	console.log('  - admin@purfacted.com');
}

main()
	.catch((e) => {
		console.error('❌ Seed failed:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
