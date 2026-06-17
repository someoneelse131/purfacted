import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';

const account = uniqueAccount('prof');

test.describe.configure({ mode: 'serial' });

test('edit profile bio and see it on the public profile', async ({ page, request }) => {
	await registerVerifyLogin(page, request, account);

	await page.goto('/account');
	await page.getByLabel('Bio').fill('I check sources for a living.');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	await page.goto(`/users/${account.username}`);
	await expect(page.getByRole('heading', { name: account.username })).toBeVisible();
	await expect(page.getByText('I check sources for a living.')).toBeVisible();
	await expect(page.getByTestId('reputation')).toBeVisible();
	await expect(page.getByText('Level 1')).toBeVisible();
});

test('hide stats removes reputation and level from the public view', async ({ page, browser }) => {
	// log back in (serial file, fresh context per test)
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(account.username);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: account.username })).toBeVisible();

	await page.goto('/account');
	await page.getByLabel('Hide my stats and activity on the public profile').check();
	await page.getByRole('button', { name: 'Save settings' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();

	// anonymous visitor sees no stats
	const anonContext = await browser.newContext();
	const anonPage = await anonContext.newPage();
	await anonPage.goto(`/users/${account.username}`);
	await expect(anonPage.getByRole('heading', { name: account.username })).toBeVisible();
	await expect(anonPage.getByTestId('reputation')).not.toBeVisible();
	await expect(anonPage.getByText('Level 1')).not.toBeVisible();
	// and is told the activity is hidden rather than seeing a bare "no activity"
	await expect(anonPage.getByTestId('stats-hidden')).toBeVisible();
	await anonContext.close();
});

test('unknown profiles return 404', async ({ page }) => {
	const response = await page.goto('/users/does-not-exist-xyz');
	expect(response?.status()).toBe(404);
});
