import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

// Integration tests run against a separate database that is wiped before the
// run (see CLAUDE.md testing strategy). Falls back to the local compose stack.
export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	'postgresql://purfacted:devpassword@localhost:5432/purfacted_test';

function assertTestUrl(): void {
	const dbName = new URL(TEST_DATABASE_URL).pathname;
	if (!dbName.endsWith('_test')) {
		throw new Error(`Refusing to reset "${dbName}": the test database name must end in "_test".`);
	}
}

// Creates the test database if missing and syncs the schema (non-destructive).
export function pushTestSchema(): void {
	assertTestUrl();
	execSync('npx prisma db push --skip-generate', {
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: 'pipe'
	});
}

// Empties every app table; replaces prisma's --force-reset so no destructive
// CLI command is needed.
export async function truncateAll(prisma: PrismaClient): Promise<void> {
	assertTestUrl();
	const tables = await prisma.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables
		WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'`;
	if (tables.length === 0) return;
	const list = tables.map((t) => `"${t.tablename}"`).join(', ');
	await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export function createTestClient(): PrismaClient {
	return new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
}

// Standard setup for integration test files.
export async function setupTestDb(): Promise<PrismaClient> {
	pushTestSchema();
	const prisma = createTestClient();
	await truncateAll(prisma);
	return prisma;
}
