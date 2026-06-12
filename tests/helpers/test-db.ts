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

function deployMigrations(): void {
	execSync('npx prisma migrate deploy', {
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: 'pipe'
	});
}

async function createDatabaseIfMissing(): Promise<void> {
	const url = new URL(TEST_DATABASE_URL);
	const dbName = url.pathname.slice(1);
	url.pathname = '/postgres';
	const admin = new PrismaClient({ datasourceUrl: url.toString() });
	try {
		const exists = await admin.$queryRaw<unknown[]>`
			SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
		if (exists.length === 0) {
			await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
		}
	} finally {
		await admin.$disconnect();
	}
}

// Brings the test database to the exact migration state of the app
// (`prisma db push` cannot represent the generated tsvector column, so the
// real migrations are the source of truth here too). Self-heals databases
// that predate this helper by recreating the schema - test data only.
export async function ensureTestSchema(): Promise<void> {
	assertTestUrl();
	try {
		deployMigrations();
		return;
	} catch {
		// missing database or a schema without migration history - rebuild
	}
	await createDatabaseIfMissing();
	const client = createTestClient();
	try {
		await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
		await client.$executeRawUnsafe('CREATE SCHEMA public');
	} finally {
		await client.$disconnect();
	}
	deployMigrations();
}

// Empties every app table; no destructive prisma CLI command needed.
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
	await ensureTestSchema();
	const prisma = createTestClient();
	await truncateAll(prisma);
	return prisma;
}
