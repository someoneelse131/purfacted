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

async function main() {
	const prisma = new PrismaClient();
	try {
		await seedConfig(prisma);
		const count = await prisma.config.count();
		console.log(`Seed complete: ${count} config entries.`);
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
