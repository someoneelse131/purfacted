import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';

const author = uniqueAccount('author');
const reviewer = uniqueAccount('rev');
const claim = `Coffee lowers diabetes risk ${Date.now().toString(36)}`;
const contraUrl = `https://www.reuters.com/health/coffee-${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('submit a fact with starting source, it appears in the Review Hub', async ({
	page,
	request
}) => {
	await registerVerifyLogin(page, request, author);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Moderate daily consumption, observational data.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill('https://pubmed.ncbi.nlm.nih.gov/9999999/');
	await page.getByLabel('Source title').fill('Meta-analysis of prospective cohorts');
	await page.getByRole('button', { name: 'Submit for review' }).click();

	// lands on the fact page
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	await expect(page.getByText('Under review')).toBeVisible();
	await expect(page.getByText('Meta-analysis of prospective cohorts')).toBeVisible();
	// auto-detected as peer-reviewed
	await expect(page.getByText('Peer-reviewed · C5')).toBeVisible();

	// appears in the Review Hub
	await page.goto('/review');
	await expect(page.getByRole('link', { name: claim })).toBeVisible();
});

test('another user adds CONTRA evidence and votes; duplicates are rejected', async ({
	page,
	request
}) => {
	await registerVerifyLogin(page, request, reviewer);

	await page.goto('/review');
	await page.getByRole('link', { name: claim }).click();

	// add a CONTRA source
	await page.getByLabel('Contradicts it (CONTRA)').check();
	await page.locator('form[action="?/addSource"]').getByLabel('URL').fill(contraUrl);
	await page
		.locator('form[action="?/addSource"]')
		.getByLabel('Title')
		.fill('Cohort study finds no effect');
	await page.getByRole('button', { name: 'Add source' }).click();
	await expect(page.getByText('Cohort study finds no effect')).toBeVisible();
	await expect(page.getByTestId('contra-column').getByTestId('source-card')).toHaveCount(1);

	// duplicate URL is rejected
	await page.getByLabel('Contradicts it (CONTRA)').check();
	await page.locator('form[action="?/addSource"]').getByLabel('URL').fill(contraUrl);
	await page.locator('form[action="?/addSource"]').getByLabel('Title').fill('Same study again');
	await page.getByRole('button', { name: 'Add source' }).click();
	await expect(page.getByText('already on the fact')).toBeVisible();

	// upvote the PRO source. The fact is UNDER_REVIEW, so blind review (R24)
	// hides the score and shows only neutral participation + the own vote.
	const proCard = page.getByTestId('pro-column').getByTestId('source-card').first();
	await proCard.getByRole('button', { name: 'credible and supports its side' }).click();
	await expect(
		page
			.getByTestId('pro-column')
			.getByTestId('source-card')
			.first()
			.getByTestId('source-score-hidden')
	).toContainText('score hidden during review');
	await expect(
		page.getByTestId('pro-column').getByTestId('source-card').first().getByTestId('source-score')
	).toHaveCount(0);
});

test('the author cannot vote on sources of their own fact', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(author.username);
	await page.getByLabel('Password').fill(author.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: author.username })).toBeVisible();

	await page.goto('/review');
	await page.getByRole('link', { name: claim }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	// vote buttons are not rendered for the author
	await expect(page.getByRole('button', { name: 'credible and supports its side' })).toHaveCount(0);
});
