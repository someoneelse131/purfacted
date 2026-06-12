import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { overrideConfig } from './db-helpers';

const author = uniqueAccount('veta');
const reviewer = uniqueAccount('vetr');
const vetoer = uniqueAccount('vetv');
const runTag = Date.now().toString(36);
const claim = `Vetoed claim about honey ${runTag}`;

test.describe.configure({ mode: 'serial' });

let restoreConfig: (() => Promise<void>) | undefined;
let factUrl = '';

test.beforeAll(async () => {
	restoreConfig = await overrideConfig({
		'quorum.min_total_weight': '1',
		'quorum.min_reviewers': '1',
		'quorum.min_review_hours': '0'
	});
});

test.afterAll(async () => {
	await restoreConfig?.();
});

test('veto sends a decided fact back to review', async ({ page, request }) => {
	// author submits, reviewer verifies
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Veto E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Food & Nutrition' });
	await page.getByLabel('URL').fill(`https://www.nature.com/articles/honey-${runTag}`);
	await page.getByLabel('Source title').fill('Supporting paper');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	factUrl = page.url();

	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reviewer);
	await page.goto(factUrl);
	await page.getByRole('button', { name: 'credible and supports its side' }).click();
	await expect(page.getByText('Verified', { exact: true })).toBeVisible();

	// vetoer objects with a new source
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, vetoer);
	await page.goto(factUrl);
	await page.locator('summary', { hasText: 'Submit a veto' }).click();
	await page.getByLabel('Why is the verdict wrong?').fill('A newer meta-analysis contradicts it.');
	await page.getByLabel('New source URL').fill(`https://doi.org/10.1000/honey-${runTag}`);
	await page.getByLabel('New source title').fill('Newer meta-analysis');
	await page.getByRole('button', { name: 'Submit veto' }).click();

	await expect(page.getByText('Veto - back under review')).toBeVisible();
	await expect(page.getByText('Under review', { exact: true })).toBeVisible();
});

test('re-decision resolves the veto and pays out reputation', async ({ page }) => {
	// reviewer upvotes the new CONTRA source -> balance flips to DISPUTED
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(reviewer.username);
	await page.getByLabel('Password').fill(reviewer.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: reviewer.username })).toBeVisible();

	await page.goto(factUrl);
	const contraCard = page
		.getByTestId('contra-column')
		.getByTestId('source-card')
		.filter({ hasText: 'Newer meta-analysis' });
	await contraCard.getByRole('button', { name: 'credible and supports its side' }).click();

	// PRO 5 vs CONTRA 5 -> DISPUTED; status changed -> veto succeeded
	await expect(page.getByText('Disputed', { exact: true })).toBeVisible();
	await expect(page.getByText('Veto - back under review')).toHaveCount(0);

	// vetoer earned +5 (veto) +2 (source consensus) = 7 reputation
	await page.goto(`/users/${vetoer.username}`);
	await expect(page.getByTestId('reputation')).toHaveText('7 reputation');
});
