import { expect, test } from '@playwright/test';
import { uniqueAccount } from './helpers';

const bot = uniqueAccount('bot');

test('a registration with a filled honeypot creates no account', async ({ page }) => {
	await page.goto('/register');
	await page.getByLabel('Username').fill(bot.username);
	await page.getByLabel('Email').fill(bot.email);
	await page.getByLabel('Password').fill(bot.password);
	// the hidden field a human never sees
	await page.locator('input[name="website"]').evaluate((el) => {
		(el as HTMLInputElement).value = 'https://spam.example';
	});
	await page.getByRole('button', { name: 'Sign up' }).click();

	// looks like success to the bot...
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

	// ...but no account exists
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(bot.username);
	await page.getByLabel('Password').fill(bot.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByText('Invalid credentials.')).toBeVisible();
});
