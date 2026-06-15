import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount, submitFactForReview } from './helpers';
import { overrideConfig } from './db-helpers';

const author = uniqueAccount('feeda');
const reviewer = uniqueAccount('feedr');
const runTag = Date.now().toString(36);
const decidedClaim = `Bananas are berries botanically ${runTag}`;
const pendingClaim = `Pending pineapple claim ${runTag}`;

test.describe.configure({ mode: 'serial' });

let restoreConfig: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
	restoreConfig = await overrideConfig({
		'quorum.min_total_weight': '1',
		'quorum.min_reviewers': '1',
		'quorum.min_review_hours': '0',
		// predates R24 confidence damping; decide on a single vote (K=0)
		'scoring.confidence_k': '0',
		// R24: disable probation so a single fresh reviewer counts toward quorum
		'probation.min_reputation': '0',
		'probation.min_account_age_days': '0'
	});
});

test.afterAll(async () => {
	await restoreConfig?.();
});

async function submit(page: import('@playwright/test').Page, claim: string, url: string) {
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Feed E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Food & Nutrition' });
	await page.getByLabel('URL').fill(url);
	await page.getByLabel('Source title').fill('Botanical reference');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
}

test('feed shows only decided facts and search finds them', async ({ page, request }) => {
	// author submits two claims
	await registerVerifyLogin(page, request, author);
	await submit(page, decidedClaim, `https://www.nature.com/articles/banana-${runTag}`);
	await submit(page, pendingClaim, `https://www.nature.com/articles/pineapple-${runTag}`);

	// reviewer decides the banana claim
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reviewer);
	await page.goto('/review');
	await page.getByRole('link', { name: decidedClaim }).click();
	await page.getByRole('button', { name: 'credible and supports its side' }).click();
	await expect(page.getByText('Verified', { exact: true })).toBeVisible();

	// feed contains the decided claim, not the pending one
	await page.goto('/facts');
	await expect(page.getByTestId('feed-entry').filter({ hasText: decidedClaim })).toBeVisible();
	await expect(page.getByTestId('feed-entry').filter({ hasText: pendingClaim })).toHaveCount(0);

	// full-text search finds it (stemmed: "berry" matches "berries")
	await page.getByLabel('Search').fill(`berry ${runTag}`);
	await page.getByRole('button', { name: 'Apply' }).click();
	await page.waitForURL(/q=berry/);
	await expect(page.getByTestId('feed-entry').filter({ hasText: decidedClaim })).toBeVisible();

	// search with no hits
	await page.getByLabel('Search').fill('zzznosuchclaim');
	await page.getByRole('button', { name: 'Apply' }).click();
	await page.waitForURL(/q=zzznosuchclaim/);
	await expect(page.getByText('No decided facts match.')).toBeVisible();
});

test('fact detail renders all sections with OG tags', async ({ page }) => {
	await page.goto('/facts');
	await page.getByTestId('feed-entry').filter({ hasText: decidedClaim }).getByRole('link').click();

	await expect(page.getByRole('heading', { name: decidedClaim })).toBeVisible();
	await expect(page.getByText('Verified', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: /PRO evidence/ })).toBeVisible();
	await expect(page.getByRole('heading', { name: /CONTRA evidence/ })).toBeVisible();
	await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', decidedClaim);
});
