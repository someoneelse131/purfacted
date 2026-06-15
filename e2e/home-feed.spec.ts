import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { submitFactForReview } from './helpers';

// R30: personalized home feed from followed users/categories, with a global tab
// and a fallback to global activity when the followed scope is empty.

test('home feed reflects follows and falls back to global when empty', async ({
	page,
	request
}) => {
	const account = uniqueAccount('home');
	const claim = `Home-feed claim ${Date.now()} stays unique across runs`;
	await registerVerifyLogin(page, request, account);

	// nothing followed yet -> the following tab falls back to global activity
	await page.goto('/home');
	await expect(page.getByTestId('tab-following')).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByTestId('fallback-notice')).toBeVisible();

	// follow the Science category
	await page.goto('/categories/science');
	await page.getByTestId('follow-toggle').click();
	await expect(page.getByTestId('follow-toggle')).toHaveText('Following');

	// create activity inside the followed category
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the home-feed claim, observational.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/home-feed/${Date.now()}`);
	await page.getByLabel('Source title').fill('Supporting reference for the home-feed claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);

	// the following feed now shows the new claim, no fallback notice
	await page.goto('/home');
	await expect(page.getByTestId('fallback-notice')).toHaveCount(0);
	const feed = page.getByTestId('home-feed');
	await expect(feed.getByRole('link', { name: claim })).toBeVisible();
	const item = page.getByTestId('home-feed-item').filter({ hasText: claim });
	await expect(item.getByText('submitted a new claim')).toBeVisible();

	// the global tab is reachable and also lists the activity
	await page.getByTestId('tab-global').click();
	await expect(page.getByTestId('tab-global')).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByTestId('home-feed').getByRole('link', { name: claim })).toBeVisible();
});

test('the home feed requires login', async ({ page }) => {
	await page.goto('/home');
	await expect(page).toHaveURL(/\/login/);
});
