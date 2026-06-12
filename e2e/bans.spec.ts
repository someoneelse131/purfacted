import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { promoteToModerator } from './db-helpers';

const target = uniqueAccount('bant');
const moderator = uniqueAccount('banm');

test.describe.configure({ mode: 'serial' });

test('moderator bans a user from the profile page', async ({ page, request }) => {
	await registerVerifyLogin(page, request, target);
	await page.getByRole('button', { name: 'Log out' }).click();

	await registerVerifyLogin(page, request, moderator);
	await promoteToModerator(moderator.username);

	await page.goto(`/users/${target.username}`);
	// promote happened after login; reload picks up the moderator role
	await page.reload();
	await page.getByLabel('Ban reason').fill('Repeated spam');
	await page.getByRole('button', { name: 'Ban (escalating)' }).click();
	await expect(page.getByText('User banned (level 1).')).toBeVisible();
});

test('the banned user sees the banner and is read-only', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(target.username);
	await page.getByLabel('Password').fill(target.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: target.username })).toBeVisible();

	// banner with reason and expiry
	await expect(page.getByText('Your account is banned and read-only')).toBeVisible();
	await expect(page.getByText('Repeated spam')).toBeVisible();
	await expect(page.getByText(/The ban ends on/)).toBeVisible();

	// posting is blocked
	const res = await page.goto('/submit');
	expect(res?.status()).toBe(403);
});
