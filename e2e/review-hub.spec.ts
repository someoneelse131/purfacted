import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { expireFactByTitle } from './db-helpers';

const account = uniqueAccount('hub');
const claim = `Hub filters find this claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('hub lists the fact with quorum gaps and category filter works', async ({ page, request }) => {
	await registerVerifyLogin(page, request, account);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Review hub E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Sports' });
	await page.getByLabel('URL').fill(`https://example.org/hub-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Initial source');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	await page.goto('/review');
	const entry = page.getByTestId('hub-entry').filter({ hasText: claim });
	await expect(entry).toBeVisible();
	await expect(entry.getByText(/Needs .*reviewer/)).toBeVisible();

	// category filter: Sports shows it, Science hides it
	await page.getByLabel('Category').selectOption({ label: 'Sports' });
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('hub-entry').filter({ hasText: claim })).toBeVisible();

	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.getByTestId('hub-entry').filter({ hasText: claim })).toHaveCount(0);
});

test('an expired fact appears under Unsubstantiated and can be revived once', async ({ page }) => {
	await expireFactByTitle(claim);

	// log back in
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(account.username);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: account.username })).toBeVisible();

	await page.goto('/review?tab=unsubstantiated');
	const entry = page.getByTestId('hub-entry').filter({ hasText: claim });
	await expect(entry).toBeVisible();
	await entry.getByRole('link', { name: claim }).click();

	// revive by adding a new source
	await expect(page.getByText('re-opens it once')).toBeVisible();
	await page.getByLabel('Contradicts it (CONTRA)').check();
	await page
		.locator('form[action="?/addSource"]')
		.getByLabel('URL')
		.fill(`https://example.org/revive-${Date.now().toString(36)}`);
	await page.locator('form[action="?/addSource"]').getByLabel('Title').fill('Reviving source');
	await page
		.locator('form[action="?/addSource"]')
		.getByLabel('Supporting quote')
		.fill('This freshly added source reopens the review with new contradicting data.');
	await page.getByRole('button', { name: 'Add source' }).click();

	await expect(page.getByText('Under review')).toBeVisible();
	await page.goto('/review');
	await expect(page.getByTestId('hub-entry').filter({ hasText: claim })).toBeVisible();
});
