import { PrismaClient } from '@prisma/client';

// E2E tests run against the local dev stack; this client talks straight to
// the dev database for fixtures that have no UI (e.g. promoting moderators).
const prisma = new PrismaClient({
	datasourceUrl:
		process.env.DATABASE_URL ?? 'postgresql://purfacted:devpassword@localhost:5432/purfacted'
});

export async function promoteToModerator(username: string): Promise<void> {
	await prisma.user.update({ where: { username }, data: { role: 'MODERATOR' } });
}
