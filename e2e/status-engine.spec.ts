import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { overrideConfig } from './db-helpers';

const author = uniqueAccount('qauthor');
const reviewer = uniqueAccount('qrev');
const claim = `Quorum flips this claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

let restoreConfig: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
	// shrink the quorum so a single reviewer decides instantly (R12 E2E)
	restoreConfig = await overrideConfig({
		'quorum.min_total_weight': '1',
		'quorum.min_reviewers': '1',
		'quorum.min_review_hours': '0',
		// this spec predates R24 confidence damping and decides on a single
		// vote, so disable damping (K=0) to keep its thin-evidence verdicts
		'scoring.confidence_k': '0',
		// R24: disable probation so a single fresh reviewer counts toward quorum
		'probation.min_reputation': '0',
		'probation.min_account_age_days': '0'
	});
});

test.afterAll(async () => {
	await restoreConfig?.();
});

test('a fact reaches quorum and flips to VERIFIED (R12)', async ({ page, request }) => {
	// author submits
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('E2E quorum flow.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill('https://www.nature.com/articles/e2e-quorum');
	await page.getByLabel('Source title').fill('Strong supporting paper');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	await expect(page.getByText('Under review')).toBeVisible();
	const factUrl = page.url();

	// log out, reviewer votes the PRO source up
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reviewer);
	await page.goto(factUrl);
	await page.getByRole('button', { name: 'credible and supports its side' }).click();

	// the vote completed the quorum - the fact is decided
	await expect(page.getByText('Verified', { exact: true })).toBeVisible();
	// evidence interactions close after the decision
	await expect(page.getByRole('button', { name: 'Add source' })).toHaveCount(0);
});
