import { expect, test } from '@playwright/test';
import { registerVerifyLogin, submitFactForReview, uniqueAccount } from './helpers';

// R31: the "Needs your review" hotspots section renders on the home page and
// the Review Hub, and its entries link to the fact pages. A freshly submitted
// claim has a single starting source with no votes, which guarantees at least
// one hotspot (under-reviewed evidence) exists.

test('hotspots section renders on the Review Hub and links work', async ({ page, request }) => {
	const account = uniqueAccount('hot');
	const claim = `Hotspot claim ${Date.now()} needs reviewing soon`;
	await registerVerifyLogin(page, request, account);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the hotspot claim, observational.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/hotspot/${Date.now()}`);
	await page.getByLabel('Source title').fill('Starting reference for the hotspot claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);

	// Review Hub shows the hotspots section, and its first entry links to a fact
	await page.goto('/review');
	const hotspots = page.getByTestId('hotspots');
	await expect(hotspots).toBeVisible();
	const firstLink = hotspots.getByTestId('hotspot-item').first().getByRole('link').first();
	await expect(firstLink).toBeVisible();
	await firstLink.click();
	await expect(page).toHaveURL(/\/facts\/[a-z0-9]+/i);
	await expect(page.getByText('Under review')).toBeVisible();
});

test('hotspots section renders on the home page', async ({ page, request }) => {
	const account = uniqueAccount('hoth');
	const claim = `Home hotspot claim ${Date.now()} awaiting review`;
	await registerVerifyLogin(page, request, account);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the home hotspot claim.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/home-hotspot/${Date.now()}`);
	await page.getByLabel('Source title').fill('Starting reference for the home hotspot claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);

	await page.goto('/home');
	await expect(page.getByTestId('hotspots')).toBeVisible();
});
