import { PrismaClient } from '@prisma/client';
import { CONFIG_DEFAULTS } from '../src/lib/server/config-defaults';

export async function seedConfig(prisma: PrismaClient): Promise<void> {
	for (const entry of CONFIG_DEFAULTS) {
		await prisma.config.upsert({
			where: { key: entry.key },
			// Existing values are operator-tuned via the admin panel - only
			// refresh the description, never overwrite the value.
			update: { description: entry.description },
			create: entry
		});
	}
}

// ~15 curated top-level categories (R8). Idempotent by slug.
export const CATEGORY_SEED: { name: string; slug: string }[] = [
	{ name: 'Science', slug: 'science' },
	{ name: 'Health & Medicine', slug: 'health-medicine' },
	{ name: 'Technology', slug: 'technology' },
	{ name: 'Environment & Climate', slug: 'environment-climate' },
	{ name: 'Politics', slug: 'politics' },
	{ name: 'Economy & Finance', slug: 'economy-finance' },
	{ name: 'History', slug: 'history' },
	{ name: 'Society & Culture', slug: 'society-culture' },
	{ name: 'Sports', slug: 'sports' },
	{ name: 'Food & Nutrition', slug: 'food-nutrition' },
	{ name: 'Education', slug: 'education' },
	{ name: 'Law & Justice', slug: 'law-justice' },
	{ name: 'Media & Internet', slug: 'media-internet' },
	{ name: 'Space & Astronomy', slug: 'space-astronomy' },
	{ name: 'Energy', slug: 'energy' }
];

export async function seedCategories(prisma: PrismaClient): Promise<void> {
	for (const category of CATEGORY_SEED) {
		await prisma.category.upsert({
			where: { slug: category.slug },
			update: {},
			create: { ...category, status: 'ACTIVE' }
		});
	}
}

async function main() {
	const prisma = new PrismaClient();
	try {
		await seedConfig(prisma);
		await seedCategories(prisma);
		const configCount = await prisma.config.count();
		const categoryCount = await prisma.category.count();
		console.log(`Seed complete: ${configCount} config entries, ${categoryCount} categories.`);
	} finally {
		await prisma.$disconnect();
	}
}

const isDirectRun = process.argv[1]?.endsWith('seed.ts');
if (isDirectRun) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
