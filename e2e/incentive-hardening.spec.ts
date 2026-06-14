import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { overrideConfig } from './db-helpers';

// R24 - Scoring & Incentive Hardening: blind review (scores hidden until a
// decision), a vetoed fact stays in the feed as contested, and claim
// immutability once another member has interacted.

const author = uniqueAccount('iha');
const reviewer = uniqueAccount('ihr');
const vetoer = uniqueAccount('ihv');
const runTag = Date.now().toString(36);
const claim = `Honey cures every cold for sure ${runTag}`;

test.describe.configure({ mode: 'serial' });

let restoreConfig: (() => Promise<void>) | undefined;
let factUrl = '';

test.beforeAll(async () => {
	// decide on a single vote; K=0 disables damping so one vote is enough
	restoreConfig = await overrideConfig({
		'quorum.min_total_weight': '1',
		'quorum.min_reviewers': '1',
		'quorum.min_review_hours': '0',
		'scoring.confidence_k': '0',
		// R24: disable probation so a single fresh reviewer counts toward quorum
		'probation.min_reputation': '0',
		'probation.min_account_age_days': '0'
	});
});

test.afterAll(async () => {
	await restoreConfig?.();
});

test('scores stay hidden while under review, revealed once decided', async ({ page, request }) => {
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Blind review E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Food & Nutrition' });
	await page.getByLabel('URL').fill(`https://www.nature.com/articles/ih-${runTag}`);
	await page.getByLabel('Source title').fill('Supporting paper');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	factUrl = page.url();

	// while UNDER_REVIEW the score is hidden, even from the author
	await expect(page.getByTestId('source-score-hidden').first()).toBeVisible();
	await expect(page.getByTestId('source-score')).toHaveCount(0);

	// a reviewer votes -> single-vote quorum decides the fact VERIFIED
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reviewer);
	await page.goto(factUrl);
	await expect(page.getByTestId('source-score-hidden').first()).toBeVisible();
	await page.getByRole('button', { name: 'credible and supports its side' }).click();
	await expect(page.getByText('Verified', { exact: true })).toBeVisible();

	// once decided, the per-source score is revealed
	await expect(page.getByTestId('source-score').first()).toBeVisible();
	await expect(page.getByTestId('source-score-hidden')).toHaveCount(0);
});

test('a vetoed fact stays in the feed marked contested', async ({ page, request }) => {
	// serial specs get a fresh page per test, so just log in the vetoer
	await registerVerifyLogin(page, request, vetoer);
	await page.goto(factUrl);
	await page.locator('summary', { hasText: 'Submit a veto' }).click();
	await page.getByLabel('Why is the verdict wrong?').fill('A newer review contradicts this.');
	await page.getByLabel('New source URL').fill(`https://doi.org/10.1000/ih-${runTag}`);
	await page.getByLabel('New source title').fill('Newer review');
	await page.getByRole('button', { name: 'Submit veto' }).click();
	await expect(page.getByText('Under review', { exact: true })).toBeVisible();

	// the fact is back under review but still appears in the main feed, keeping
	// its previous VERIFIED status and a contested marker
	await page.goto('/facts?status=VERIFIED');
	const entry = page.getByTestId('feed-entry').filter({ hasText: claim });
	await expect(entry).toBeVisible();
	await expect(entry.getByTestId('contested-badge')).toBeVisible();
});

test('the author cannot edit the claim after others have interacted', async ({ page, request }) => {
	// a brand-new claim with no foreign interaction yet is editable
	const soloAuthor = uniqueAccount('ihe');
	const soloClaim = `A freshly minted editable claim ${runTag}`;
	await registerVerifyLogin(page, request, soloAuthor);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(soloClaim);
	await page.getByLabel('Context').fill('Editable E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Food & Nutrition' });
	await page.getByLabel('URL').fill(`https://www.nature.com/articles/ihe-${runTag}`);
	await page.getByLabel('Source title').fill('Supporting paper');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: soloClaim })).toBeVisible();
	const soloUrl = page.url();

	await page.locator('summary', { hasText: 'Edit claim' }).click();
	const editForm = page.locator('form[action="?/editFact"]');
	await editForm.getByLabel('Claim').fill(`${soloClaim} (clarified)`);
	await editForm.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByRole('heading', { name: `${soloClaim} (clarified)` })).toBeVisible();

	// another member votes on the starting source -> wording locks
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, uniqueAccount('ihx'));
	await page.goto(soloUrl);
	await page.getByRole('button', { name: 'credible and supports its side' }).click();

	// the author no longer sees an edit affordance
	await page.getByRole('button', { name: 'Log out' }).click();
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(soloAuthor.username);
	await page.getByLabel('Password').fill(soloAuthor.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await page.goto(soloUrl);
	await expect(page.locator('summary', { hasText: 'Edit claim' })).toHaveCount(0);
});
