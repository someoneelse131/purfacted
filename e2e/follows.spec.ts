import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';

// R29: follow/unfollow users and categories, follower counts, manage in settings.

test('follow and unfollow a category, manage it in settings', async ({ page, request }) => {
	const account = uniqueAccount('folcat');
	await registerVerifyLogin(page, request, account);

	await page.goto('/categories/science');
	const toggle = page.getByTestId('follow-toggle');
	await expect(toggle).toHaveText('Follow');
	await toggle.click();
	await expect(page.getByTestId('follow-toggle')).toHaveText('Following');

	// the followed category shows up in account settings
	await page.goto('/account');
	const following = page.getByTestId('following');
	await expect(following.getByRole('link', { name: 'Science' })).toBeVisible();

	// unfollow from settings -> it disappears
	await following
		.locator('li', { has: page.getByRole('link', { name: 'Science' }) })
		.getByRole('button', { name: 'Unfollow' })
		.click();
	await expect(following.getByRole('link', { name: 'Science' })).toHaveCount(0);

	// the category page reflects the unfollowed state again
	await page.goto('/categories/science');
	await expect(page.getByTestId('follow-toggle')).toHaveText('Follow');
});

test('follow a user and see the follower count on their profile', async ({
	page,
	request,
	browser
}) => {
	const target = uniqueAccount('foltgt');
	const follower = uniqueAccount('folusr');

	// create the follow target in its own context, then discard it
	const targetContext = await browser.newContext();
	const targetPage = await targetContext.newPage();
	await registerVerifyLogin(targetPage, request, target);
	await targetContext.close();

	await registerVerifyLogin(page, request, follower);

	await page.goto(`/users/${target.username}`);
	await expect(page.getByTestId('follower-count')).toContainText('0 followers');
	const toggle = page.getByTestId('follow-toggle');
	await expect(toggle).toHaveText('Follow');
	await toggle.click();
	await expect(page.getByTestId('follow-toggle')).toHaveText('Following');
	await expect(page.getByTestId('follower-count')).toContainText('1 follower');

	// followed user appears in settings and can be unfollowed
	await page.goto('/account');
	const following = page.getByTestId('following');
	await expect(following.getByRole('link', { name: target.username })).toBeVisible();
});
