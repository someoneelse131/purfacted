/**
 * R49: Seed Data
 *
 * Creates sample data for testing and development.
 * Run with: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Default password for all seed users
const DEFAULT_PASSWORD = 'Test123!@#';

async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 10);
}

async function main() {
	console.log('🌱 Starting seed...');

	const passwordHash = await hashPassword(DEFAULT_PASSWORD);

	// ====================================
	// Create Users
	// ====================================
	console.log('Creating users...');

	// Verified User
	const verifiedUser = await prisma.user.upsert({
		where: { email: 'verified@example.com' },
		update: {},
		create: {
			email: 'verified@example.com',
			firstName: 'Vera',
			lastName: 'Verified',
			passwordHash,
			emailVerified: true,
			userType: 'VERIFIED',
			trustScore: 25
		}
	});

	// Expert User
	const expertUser = await prisma.user.upsert({
		where: { email: 'expert@example.com' },
		update: {},
		create: {
			email: 'expert@example.com',
			firstName: 'Emma',
			lastName: 'Expert',
			passwordHash,
			emailVerified: true,
			userType: 'EXPERT',
			trustScore: 75
		}
	});

	// PhD User
	const phdUser = await prisma.user.upsert({
		where: { email: 'phd@example.com' },
		update: {},
		create: {
			email: 'phd@example.com',
			firstName: 'Paul',
			lastName: 'Professor',
			passwordHash,
			emailVerified: true,
			userType: 'PHD',
			trustScore: 100
		}
	});

	// Organization User
	const orgUser = await prisma.user.upsert({
		where: { email: 'org@acme.com' },
		update: {},
		create: {
			email: 'org@acme.com',
			firstName: 'Acme',
			lastName: 'Corporation',
			passwordHash,
			emailVerified: true,
			userType: 'ORGANIZATION',
			trustScore: 50
		}
	});

	// Moderator User
	const moderatorUser = await prisma.user.upsert({
		where: { email: 'moderator@example.com' },
		update: {},
		create: {
			email: 'moderator@example.com',
			firstName: 'Max',
			lastName: 'Moderator',
			passwordHash,
			emailVerified: true,
			userType: 'MODERATOR',
			trustScore: 80
		}
	});

	console.log('✅ Created 5 users');

	// ====================================
	// Create Categories
	// ====================================
	console.log('Creating categories...');

	const categories = await Promise.all([
		prisma.category.upsert({
			where: { name: 'Science' },
			update: {},
			create: { name: 'Science', createdById: moderatorUser.id }
		}),
		prisma.category.upsert({
			where: { name: 'Health' },
			update: {},
			create: { name: 'Health', createdById: moderatorUser.id }
		}),
		prisma.category.upsert({
			where: { name: 'Technology' },
			update: {},
			create: { name: 'Technology', createdById: moderatorUser.id }
		}),
		prisma.category.upsert({
			where: { name: 'Environment' },
			update: {},
			create: { name: 'Environment', createdById: moderatorUser.id }
		}),
		prisma.category.upsert({
			where: { name: 'History' },
			update: {},
			create: { name: 'History', createdById: moderatorUser.id }
		})
	]);

	// Create category aliases
	await prisma.categoryAlias.upsert({
		where: { alias: 'Medical' },
		update: {},
		create: {
			alias: 'Medical',
			categoryId: categories[1].id // Health
		}
	});

	await prisma.categoryAlias.upsert({
		where: { alias: 'Climate' },
		update: {},
		create: {
			alias: 'Climate',
			categoryId: categories[3].id // Environment
		}
	});

	console.log('✅ Created 5 categories with 2 aliases');

	// ====================================
	// Create Sources
	// ====================================
	console.log('Creating sources...');

	const sources = await Promise.all([
		prisma.source.upsert({
			where: { url: 'https://nature.com/articles/sample1' },
			update: {},
			create: {
				url: 'https://nature.com/articles/sample1',
				title: 'Nature Journal Article',
				type: 'JOURNAL',
				credibilityScore: 95,
				userId: phdUser.id
			}
		}),
		prisma.source.upsert({
			where: { url: 'https://reuters.com/article/sample' },
			update: {},
			create: {
				url: 'https://reuters.com/article/sample',
				title: 'Reuters News Report',
				type: 'NEWS_OUTLET',
				credibilityScore: 85,
				userId: expertUser.id
			}
		}),
		prisma.source.upsert({
			where: { url: 'https://gov.data.example/statistics' },
			update: {},
			create: {
				url: 'https://gov.data.example/statistics',
				title: 'Government Statistics',
				type: 'GOVERNMENT',
				credibilityScore: 90,
				userId: verifiedUser.id
			}
		}),
		prisma.source.upsert({
			where: { url: 'https://example-university.edu/research' },
			update: {},
			create: {
				url: 'https://example-university.edu/research',
				title: 'University Research Paper',
				type: 'ACADEMIC',
				credibilityScore: 88,
				userId: phdUser.id
			}
		}),
		prisma.source.upsert({
			where: { url: 'https://blog.example.com/post' },
			update: {},
			create: {
				url: 'https://blog.example.com/post',
				title: 'Expert Blog Post',
				type: 'BLOG',
				credibilityScore: 50,
				userId: verifiedUser.id
			}
		})
	]);

	console.log('✅ Created 5 sources');

	// ====================================
	// Create Facts
	// ====================================
	console.log('Creating facts...');

	const factsData = [
		{
			title: 'Water boils at 100°C at sea level',
			content: 'At standard atmospheric pressure (1 atm), pure water boils at 100°C (212°F).',
			status: 'PROVEN',
			userId: phdUser.id,
			categoryId: categories[0].id,
			sourceId: sources[0].id
		},
		{
			title: 'The Great Wall of China is visible from space',
			content: 'This is a common misconception. The Great Wall is not visible from low Earth orbit without aid.',
			status: 'DISPROVEN',
			userId: expertUser.id,
			categoryId: categories[4].id,
			sourceId: sources[1].id
		},
		{
			title: 'Regular exercise reduces cardiovascular disease risk',
			content: 'Studies show that regular physical activity can reduce the risk of heart disease by up to 35%.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[1].id,
			sourceId: sources[3].id
		},
		{
			title: 'Humans only use 10% of their brain',
			content: 'This is a myth. Brain imaging shows that we use virtually every part of the brain.',
			status: 'DISPROVEN',
			userId: phdUser.id,
			categoryId: categories[0].id,
			sourceId: sources[0].id
		},
		{
			title: 'Global average temperature has increased by 1°C since 1880',
			content: 'According to climate data, Earth\'s average surface temperature has risen about 1°C since the late 19th century.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[3].id,
			sourceId: sources[2].id
		},
		{
			title: 'Smartphones emit harmful radiation',
			content: 'Smartphones emit non-ionizing radiation which current research shows does not cause cancer.',
			status: 'DISPUTED',
			userId: verifiedUser.id,
			categoryId: categories[2].id,
			sourceId: sources[4].id
		},
		{
			title: 'Vaccines cause autism',
			content: 'Multiple large-scale studies have found no link between vaccines and autism.',
			status: 'DISPROVEN',
			userId: phdUser.id,
			categoryId: categories[1].id,
			sourceId: sources[0].id
		},
		{
			title: 'Pluto was reclassified as a dwarf planet in 2006',
			content: 'The International Astronomical Union reclassified Pluto as a dwarf planet in August 2006.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[0].id,
			sourceId: sources[1].id
		},
		{
			title: 'Sugar causes hyperactivity in children',
			content: 'Scientific studies have found no consistent evidence that sugar causes hyperactivity in children.',
			status: 'DISPROVEN',
			userId: verifiedUser.id,
			categoryId: categories[1].id,
			sourceId: sources[3].id
		},
		{
			title: 'The Internet was invented in 1969',
			content: 'ARPANET, the precursor to the Internet, was established in 1969.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[2].id,
			sourceId: sources[1].id
		},
		{
			title: 'Lightning never strikes the same place twice',
			content: 'Lightning frequently strikes the same place, especially tall structures.',
			status: 'DISPROVEN',
			userId: verifiedUser.id,
			categoryId: categories[0].id,
			sourceId: sources[0].id
		},
		{
			title: 'Honey never spoils',
			content: 'Honey can last indefinitely when properly stored due to its low moisture content and acidic pH.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[0].id,
			sourceId: sources[3].id
		},
		{
			title: 'The human body replaces all its cells every 7 years',
			content: 'While many cells are replaced, some neurons and heart muscle cells can last a lifetime.',
			status: 'DISPUTED',
			userId: phdUser.id,
			categoryId: categories[1].id,
			sourceId: sources[0].id
		},
		{
			title: 'Mount Everest is the tallest mountain on Earth',
			content: 'Measured from sea level, Everest is highest. From base to peak, Mauna Kea is taller.',
			status: 'DISPUTED',
			userId: verifiedUser.id,
			categoryId: categories[3].id,
			sourceId: sources[2].id
		},
		{
			title: 'Goldfish have a 3-second memory',
			content: 'Studies show goldfish can remember things for months, not seconds.',
			status: 'DISPROVEN',
			userId: expertUser.id,
			categoryId: categories[0].id,
			sourceId: sources[3].id
		},
		{
			title: 'AI will surpass human intelligence by 2050',
			content: 'Predictions about artificial general intelligence vary widely among researchers.',
			status: 'PENDING',
			userId: expertUser.id,
			categoryId: categories[2].id,
			sourceId: sources[4].id
		},
		{
			title: 'Renewable energy can power 100% of global needs',
			content: 'Studies show that transitioning to 100% renewable energy is technically feasible.',
			status: 'DISPUTED',
			userId: phdUser.id,
			categoryId: categories[3].id,
			sourceId: sources[2].id
		},
		{
			title: 'The pyramids of Giza were built by slaves',
			content: 'Archaeological evidence suggests the pyramids were built by paid laborers, not slaves.',
			status: 'DISPROVEN',
			userId: expertUser.id,
			categoryId: categories[4].id,
			sourceId: sources[1].id
		},
		{
			title: 'Eating carrots improves night vision',
			content: 'While vitamin A is essential for eye health, carrots won\'t give you superhuman night vision.',
			status: 'DISPUTED',
			userId: verifiedUser.id,
			categoryId: categories[1].id,
			sourceId: sources[4].id
		},
		{
			title: 'The Wright Brothers made the first powered flight in 1903',
			content: 'On December 17, 1903, the Wright Brothers achieved the first powered, controlled flight.',
			status: 'PROVEN',
			userId: expertUser.id,
			categoryId: categories[4].id,
			sourceId: sources[1].id
		}
	];

	for (const factData of factsData) {
		await prisma.fact.upsert({
			where: {
				title_userId: {
					title: factData.title,
					userId: factData.userId
				}
			},
			update: {},
			create: {
				title: factData.title,
				content: factData.content,
				status: factData.status as 'PENDING' | 'PROVEN' | 'DISPROVEN' | 'DISPUTED' | 'OUTDATED',
				userId: factData.userId,
				categoryId: factData.categoryId,
				sources: {
					connect: { id: factData.sourceId }
				}
			}
		});
	}

	console.log('✅ Created 20 facts');

	// ====================================
	// Create Discussions
	// ====================================
	console.log('Creating discussions...');

	const facts = await prisma.fact.findMany({ take: 5 });

	for (let i = 0; i < 5; i++) {
		await prisma.discussion.create({
			data: {
				factId: facts[i % facts.length].id,
				userId: i % 2 === 0 ? verifiedUser.id : expertUser.id,
				type: ['PRO', 'CONTRA', 'NEUTRAL'][i % 3] as 'PRO' | 'CONTRA' | 'NEUTRAL',
				content: `This is a sample ${['supporting', 'opposing', 'neutral'][i % 3]} discussion point for the fact.`
			}
		});
	}

	console.log('✅ Created 5 discussions');

	// ====================================
	// Create Comments
	// ====================================
	console.log('Creating comments...');

	for (let i = 0; i < 10; i++) {
		await prisma.comment.create({
			data: {
				factId: facts[i % facts.length].id,
				userId: [verifiedUser.id, expertUser.id, phdUser.id][i % 3],
				content: `Sample comment #${i + 1} on this fact. This adds to the discussion.`
			}
		});
	}

	console.log('✅ Created 10 comments');

	// ====================================
	// Create Trust Score Config
	// ====================================
	console.log('Creating configuration...');

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

	// Trust modifiers
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
	console.log('\nSample users (password for all: Test123!@#):');
	console.log('  - verified@example.com (Verified User)');
	console.log('  - expert@example.com (Expert User)');
	console.log('  - phd@example.com (PhD User)');
	console.log('  - org@acme.com (Organization)');
	console.log('  - moderator@example.com (Moderator/Admin)');
}

main()
	.catch((e) => {
		console.error('❌ Seed failed:', e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
