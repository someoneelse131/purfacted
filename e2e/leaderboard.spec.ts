import { expect, test } from '@playwright/test';
import { seedLeaderboardFixture } from './db-helpers';

// R28: the leaderboard ranks contributors by reputation gained in a window.
// The fixture seeds its own category so assertions are isolated from the
// reputation other specs accumulate on the shared dev DB.

const tag = Date.now().toString(36);
let slug: string;
let leader: string;
let runnerUp: string;

test.beforeAll(async () => {
	const fixture = await seedLeaderboardFixture(tag);
	slug = fixture.slug;
	leader = fixture.leader;
	runnerUp = fixture.runnerUp;
});

test('all-time board ranks by total reputation gained', async ({ page }) => {
	await page.goto(`/leaderboard?window=all&category=${slug}`);

	const rows = page.getByTestId('leaderboard').getByRole('listitem');
	await expect(rows).toHaveCount(2);
	// leader: 10 + 100 = 110, runnerUp: 40
	await expect(rows.nth(0)).toContainText(leader);
	await expect(rows.nth(0)).toContainText('+110');
	await expect(rows.nth(1)).toContainText(runnerUp);
	await expect(rows.nth(1)).toContainText('+40');
});

test('week window only counts recent reputation and reorders the board', async ({ page }) => {
	await page.goto(`/leaderboard?category=${slug}`); // default window = week
	await expect(page.locator('[data-window="week"]')).toHaveAttribute('aria-current', 'page');

	const rows = page.getByTestId('leaderboard').getByRole('listitem');
	await expect(rows).toHaveCount(2);
	// this week: runnerUp 40 > leader 10 (leader's 100 is 20 days old)
	await expect(rows.nth(0)).toContainText(runnerUp);
	await expect(rows.nth(0)).toContainText('+40');
	await expect(rows.nth(1)).toContainText(leader);
	await expect(rows.nth(1)).toContainText('+10');
});

test('window tabs link between time windows', async ({ page }) => {
	await page.goto(`/leaderboard?window=week&category=${slug}`);
	await page.locator('[data-window="all"]').click();
	await expect(page).toHaveURL(new RegExp(`window=all`));
	const rows = page.getByTestId('leaderboard').getByRole('listitem');
	await expect(rows.nth(0)).toContainText(leader);
});
