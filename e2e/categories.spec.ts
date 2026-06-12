import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { promoteToModerator } from './db-helpers';

const account = uniqueAccount('cat');
// unique category name per run - the dev DB persists across runs
const proposalName = `Test Topic ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('anonymous visitors browse the seeded category tree', async ({ page }) => {
	await page.goto('/categories');
	await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Science', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Health & Medicine' })).toBeVisible();

	await page.getByRole('link', { name: 'Science', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Science' })).toBeVisible();
});

test('verified user proposes a category, moderator approves it', async ({ page, request }) => {
	await registerVerifyLogin(page, request, account);

	// propose
	await page.goto('/categories');
	await page.getByLabel('Name').fill(proposalName);
	await page.getByRole('button', { name: 'Submit proposal' }).click();
	await expect(page.getByText('Proposal submitted')).toBeVisible();

	// not yet in the tree
	await expect(page.getByRole('link', { name: proposalName })).not.toBeVisible();

	// promote this account and approve via the moderation page
	await promoteToModerator(account.username);
	await page.goto('/moderation?tab=categories');
	const approveRow = page
		.locator('li', { hasText: proposalName })
		.filter({ has: page.getByRole('button', { name: 'Approve' }) });
	await approveRow.getByRole('button', { name: 'Approve' }).click();
	await expect(
		page
			.locator('li', { hasText: proposalName })
			.filter({ has: page.getByRole('button', { name: 'Approve' }) })
	).toHaveCount(0);

	// now public
	await page.goto('/categories');
	await expect(page.getByRole('link', { name: proposalName })).toBeVisible();
});

test('moderation page rejects non-moderators', async ({ browser }) => {
	const anonContext = await browser.newContext();
	const anonPage = await anonContext.newPage();
	const response = await anonPage.goto('/moderation');
	// anonymous users get redirected to login
	await anonPage.waitForURL(/\/login/);
	expect(response).not.toBeNull();
	await anonContext.close();
});
