import { PrismaClient, type FactStatus, type Side, type SourceType } from '@prisma/client';
import { hashPassword } from '../src/lib/server/services/password';
import { seedCategories, seedConfig } from './seed';

// Demo dataset for the Phase-1 acceptance environment (R20): admin +
// moderator + demo users, the curated categories, and ~20 facts in mixed
// states. Idempotent by the well-known usernames/titles. NEVER run against a
// database that holds real accounts.

const DEMO_PASSWORD = 'demo-password-2026';

interface DemoSourceSpec {
	side: Side;
	type: SourceType;
	credibility: number;
	url: string;
	title: string;
	upvotes: number; // number of weight-1 upvotes
}

interface DemoFactSpec {
	title: string;
	body: string;
	categorySlug: string;
	status: FactStatus;
	sources: DemoSourceSpec[];
}

const CRED: Record<SourceType, number> = {
	PEER_REVIEWED: 5,
	OFFICIAL: 4,
	NEWS: 3,
	COMPANY: 2,
	BLOG: 1,
	OTHER: 1
};

function src(
	side: Side,
	type: SourceType,
	url: string,
	title: string,
	upvotes: number
): DemoSourceSpec {
	return { side, type, credibility: CRED[type], url, title, upvotes };
}

const FACTS: DemoFactSpec[] = [
	{
		title: 'Regular coffee consumption is linked to lower type 2 diabetes risk',
		body: 'Observational meta-analyses associate 3-4 cups/day with reduced incidence.',
		categorySlug: 'health-medicine',
		status: 'VERIFIED',
		sources: [
			src(
				'PRO',
				'PEER_REVIEWED',
				'https://doi.org/10.1000/coffee-diabetes',
				'Meta-analysis 2019',
				4
			),
			src('PRO', 'NEWS', 'https://www.reuters.com/health/coffee-diabetes', 'Reuters summary', 3)
		]
	},
	{
		title: 'The Great Wall of China is visible from the Moon with the naked eye',
		body: 'A popular claim about human structures seen from lunar distance.',
		categorySlug: 'space-astronomy',
		status: 'REFUTED',
		sources: [
			src('CONTRA', 'OFFICIAL', 'https://www.nasa.gov/great-wall-myth', 'NASA explainer', 5),
			src(
				'CONTRA',
				'PEER_REVIEWED',
				'https://doi.org/10.1000/visual-acuity',
				'Visual acuity study',
				4
			)
		]
	},
	{
		title: 'Nuclear power has one of the lowest lifecycle CO2 footprints per kWh',
		body: 'Lifecycle emissions compared across energy sources.',
		categorySlug: 'energy',
		status: 'VERIFIED',
		sources: [
			src('PRO', 'OFFICIAL', 'https://www.ipcc.ch/lifecycle-emissions', 'IPCC Annex III', 5),
			src('PRO', 'PEER_REVIEWED', 'https://doi.org/10.1000/lca-nuclear', 'LCA review', 4)
		]
	},
	{
		title: 'Daily multivitamin supplements extend lifespan in healthy adults',
		body: 'Whether routine supplementation changes mortality outcomes.',
		categorySlug: 'health-medicine',
		status: 'DISPUTED',
		sources: [
			src('PRO', 'BLOG', 'https://medium.com/@wellness/vitamins', 'Wellness blog', 3),
			src('CONTRA', 'PEER_REVIEWED', 'https://doi.org/10.1000/multivitamin-rct', 'Large RCT', 4)
		]
	},
	{
		title: 'Electric vehicles produce fewer lifetime emissions than petrol cars in the EU grid',
		body: 'Comparing manufacturing plus usage emissions on the current grid mix.',
		categorySlug: 'environment-climate',
		status: 'VERIFIED',
		sources: [
			src('PRO', 'OFFICIAL', 'https://www.eea.europa.eu/ev-lifecycle', 'EEA report', 4),
			src('PRO', 'NEWS', 'https://www.bbc.com/ev-emissions', 'BBC analysis', 3)
		]
	},
	{
		title: 'Goldfish have a memory span of only three seconds',
		body: 'A widely repeated claim about goldfish cognition.',
		categorySlug: 'science',
		status: 'REFUTED',
		sources: [
			src(
				'CONTRA',
				'PEER_REVIEWED',
				'https://doi.org/10.1000/goldfish-memory',
				'Behaviour study',
				5
			)
		]
	},
	{
		title: 'Standing desks meaningfully reduce all-cause mortality',
		body: 'Whether replacing sitting with standing changes long-term health outcomes.',
		categorySlug: 'health-medicine',
		status: 'DISPUTED',
		sources: [
			src('PRO', 'NEWS', 'https://www.theguardian.com/standing-desks', 'Guardian piece', 2),
			src(
				'CONTRA',
				'PEER_REVIEWED',
				'https://doi.org/10.1000/standing-mortality',
				'Cohort study',
				3
			)
		]
	},
	{
		title: 'Honey never spoils if stored properly',
		body: 'The claim that sealed honey remains edible essentially indefinitely.',
		categorySlug: 'food-nutrition',
		status: 'VERIFIED',
		sources: [
			src('PRO', 'OFFICIAL', 'https://www.usda.gov/honey-storage', 'USDA note', 4),
			src('PRO', 'NEWS', 'https://www.nationalgeographic.com/honey', 'Nat Geo article', 3)
		]
	},
	{
		title: 'Reading on a screen before bed significantly delays sleep onset',
		body: 'Effect of evening screen exposure on sleep latency.',
		categorySlug: 'health-medicine',
		status: 'DISPUTED',
		sources: [
			src('PRO', 'PEER_REVIEWED', 'https://doi.org/10.1000/screen-sleep', 'Sleep lab study', 3),
			src('CONTRA', 'PEER_REVIEWED', 'https://doi.org/10.1000/screen-null', 'Replication study', 3)
		]
	},
	{
		title: 'Bananas are radioactive enough to be a measurable health concern',
		body: 'Whether the potassium-40 in bananas poses a real risk.',
		categorySlug: 'science',
		status: 'REFUTED',
		sources: [src('CONTRA', 'OFFICIAL', 'https://www.epa.gov/banana-dose', 'EPA dose reference', 4)]
	},
	// --- Under review (no quorum yet) ---
	{
		title: 'A four-day work week increases overall productivity',
		body: 'Trials of compressed work weeks and their output effects.',
		categorySlug: 'economy-finance',
		status: 'UNDER_REVIEW',
		sources: [src('PRO', 'NEWS', 'https://www.ft.com/four-day-week', 'FT coverage', 2)]
	},
	{
		title: 'Microplastics are present in the majority of human blood samples tested',
		body: 'Detection rates of microplastics in human blood.',
		categorySlug: 'environment-climate',
		status: 'UNDER_REVIEW',
		sources: [
			src('PRO', 'PEER_REVIEWED', 'https://doi.org/10.1000/microplastics-blood', 'Pilot study', 2)
		]
	},
	{
		title: 'Learning a second language delays the onset of dementia',
		body: 'Bilingualism and cognitive reserve in aging.',
		categorySlug: 'science',
		status: 'UNDER_REVIEW',
		sources: [
			src(
				'PRO',
				'PEER_REVIEWED',
				'https://doi.org/10.1000/bilingual-dementia',
				'Observational study',
				1
			),
			src('CONTRA', 'PEER_REVIEWED', 'https://doi.org/10.1000/bilingual-null', 'Null result', 1)
		]
	},
	{
		title: 'Remote work reduces a company’s total carbon footprint',
		body: 'Net climate effect of distributed work arrangements.',
		categorySlug: 'environment-climate',
		status: 'UNDER_REVIEW',
		sources: [src('PRO', 'OFFICIAL', 'https://www.iea.org/remote-work', 'IEA brief', 2)]
	},
	{
		title: 'Intermittent fasting outperforms calorie restriction for weight loss',
		body: 'Head-to-head comparison of fasting protocols and plain calorie cuts.',
		categorySlug: 'food-nutrition',
		status: 'UNDER_REVIEW',
		sources: [
			src('PRO', 'BLOG', 'https://substack.com/fasting', 'Diet newsletter', 1),
			src('CONTRA', 'PEER_REVIEWED', 'https://doi.org/10.1000/fasting-rct', 'RCT', 2)
		]
	},
	{
		title: 'Public EV charging availability is the top barrier to EV adoption',
		body: 'Ranking of obstacles to electric vehicle uptake.',
		categorySlug: 'technology',
		status: 'UNDER_REVIEW',
		sources: [src('PRO', 'NEWS', 'https://www.bloomberg.com/ev-barriers', 'Survey writeup', 1)]
	},
	// --- Unsubstantiated (expired without quorum) ---
	{
		title: 'Listening to classical music improves plant growth',
		body: 'The claim that music exposure measurably affects plants.',
		categorySlug: 'science',
		status: 'UNSUBSTANTIATED',
		sources: [src('PRO', 'BLOG', 'https://wordpress.com/plant-music', 'Gardening blog', 0)]
	},
	{
		title: 'Cracking your knuckles causes arthritis',
		body: 'A common warning about a harmless-seeming habit.',
		categorySlug: 'health-medicine',
		status: 'UNSUBSTANTIATED',
		sources: [src('CONTRA', 'OTHER', 'https://example.org/knuckles', 'Anecdotal page', 0)]
	},
	{
		title: 'Tabs are objectively better than spaces for code indentation',
		body: 'The eternal developer debate, framed as a verifiable claim.',
		categorySlug: 'technology',
		status: 'UNSUBSTANTIATED',
		sources: [src('PRO', 'BLOG', 'https://dev.to/tabs-vs-spaces', 'Opinion post', 0)]
	},
	{
		title: 'The five-second rule keeps dropped food safe to eat',
		body: 'Whether quickly retrieved food avoids meaningful contamination.',
		categorySlug: 'food-nutrition',
		status: 'UNSUBSTANTIATED',
		sources: [src('CONTRA', 'NEWS', 'https://example.org/five-second', 'Lifestyle column', 0)]
	}
];

async function main() {
	const prisma = new PrismaClient();
	try {
		await seedConfig(prisma);
		await seedCategories(prisma);

		const passwordHash = await hashPassword(DEMO_PASSWORD);
		const admin = await prisma.user.upsert({
			where: { username: 'admin' },
			update: { role: 'ADMIN' },
			create: {
				username: 'admin',
				email: 'admin@purfacted.com',
				passwordHash,
				role: 'ADMIN',
				emailVerifiedAt: new Date(),
				reputation: 100
			}
		});
		await prisma.user.upsert({
			where: { username: 'moderator' },
			update: { role: 'MODERATOR' },
			create: {
				username: 'moderator',
				email: 'moderator@purfacted.com',
				passwordHash,
				role: 'MODERATOR',
				emailVerifiedAt: new Date(),
				reputation: 60
			}
		});
		const demoUsers = [];
		for (let i = 1; i <= 6; i++) {
			demoUsers.push(
				await prisma.user.upsert({
					where: { username: `demo${i}` },
					update: {},
					create: {
						username: `demo${i}`,
						email: `demo${i}@purfacted.com`,
						passwordHash,
						emailVerifiedAt: new Date(),
						reputation: i * 10
					}
				})
			);
		}
		const reviewers = [admin, ...demoUsers];

		for (const [index, spec] of FACTS.entries()) {
			const existing = await prisma.fact.findFirst({ where: { title: spec.title } });
			if (existing) continue;
			const category = await prisma.category.findUniqueOrThrow({
				where: { slug: spec.categorySlug }
			});
			const author = demoUsers[index % demoUsers.length];
			const decided = spec.status !== 'UNDER_REVIEW' && spec.status !== 'UNSUBSTANTIATED';

			const fact = await prisma.fact.create({
				data: {
					title: spec.title,
					body: spec.body,
					status: spec.status,
					authorId: author.id,
					categoryId: category.id,
					reviewStartedAt: new Date(Date.now() - 5 * 86_400_000),
					reviewDeadline: new Date(
						spec.status === 'UNSUBSTANTIATED'
							? Date.now() - 86_400_000
							: Date.now() + 9 * 86_400_000
					),
					decidedAt: decided || spec.status === 'UNSUBSTANTIATED' ? new Date() : null
				}
			});

			for (const sourceSpec of spec.sources) {
				const adder = reviewers[(index + 1) % reviewers.length];
				const source = await prisma.source.create({
					data: {
						factId: fact.id,
						side: sourceSpec.side,
						url: sourceSpec.url,
						title: sourceSpec.title,
						type: sourceSpec.type,
						credibility: sourceSpec.credibility,
						addedById: adder.id
					}
				});
				for (let v = 0; v < sourceSpec.upvotes; v++) {
					const voter = reviewers[v % reviewers.length];
					if (voter.id === author.id) continue;
					await prisma.sourceVote.create({
						data: { sourceId: source.id, userId: voter.id, value: 1, weight: 1 }
					});
				}
			}
		}

		const counts = {
			users: await prisma.user.count(),
			facts: await prisma.fact.count(),
			categories: await prisma.category.count()
		};
		console.log(
			`Demo seed complete: ${counts.users} users, ${counts.facts} facts, ${counts.categories} categories.`
		);
		console.log(`Demo login: admin / moderator / demo1..6, password "${DEMO_PASSWORD}".`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
