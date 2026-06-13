import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { promoteToModerator } from './db-helpers';

const account = uniqueAccount('cat');
// unique category names per run - the dev DB persists across runs
const proposalName = `Test Topic ${Date.now().toString(36)}`;
const managedName = `Managed Topic ${Date.now().toString(36)}`;
const renamedName = `${managedName} Renamed`;

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

test('moderator manages categories: create, rename, disable (R8)', async ({ page }) => {
	// `account` was promoted to moderator in the previous test
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(account.username);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: account.username })).toBeVisible();

	// rows contain a Move dropdown listing every top-level category, so match
	// on the dedicated name element instead of the row text
	const rowFor = (name: string) =>
		page.getByTestId('manage-category-row').filter({
			has: page.locator('[data-testid="category-name"]', { hasText: name })
		});

	// create
	await page.goto('/moderation?tab=manage');
	await page.getByLabel('Name', { exact: true }).fill(managedName);
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(rowFor(managedName)).toBeVisible();

	// it is live in the public tree
	await page.goto('/categories');
	await expect(page.getByRole('link', { name: managedName })).toBeVisible();

	// rename (the slug/URL stays stable)
	await page.goto('/moderation?tab=manage');
	const row = rowFor(managedName);
	await row.locator('summary', { hasText: 'Rename' }).click();
	await row.getByLabel(`New name for ${managedName}`).fill(renamedName);
	await row.locator('form[action*="renameCategory"]').getByRole('button', { name: 'Save' }).click();
	await expect(rowFor(renamedName)).toBeVisible();

	// disable removes it from the public tree
	await rowFor(renamedName).getByRole('button', { name: 'Disable' }).click();
	await expect(rowFor(renamedName).getByText('Disabled')).toBeVisible();
	await page.goto('/categories');
	await expect(page.getByRole('link', { name: renamedName })).not.toBeVisible();
});

test('moderation page rejects non-moderators', async ({ browser, page, request }) => {
	const anonContext = await browser.newContext();
	const anonPage = await anonContext.newPage();
	const response = await anonPage.goto('/moderation');
	// anonymous users get redirected to login
	await anonPage.waitForURL(/\/login/);
	expect(response).not.toBeNull();
	await anonContext.close();

	// verified non-moderators get a hard 403
	const outsider = uniqueAccount('catx');
	await registerVerifyLogin(page, request, outsider);
	const forbidden = await page.goto('/moderation');
	expect(forbidden?.status()).toBe(403);
	await expect(page.getByText('Moderator access required.')).toBeVisible();
});
