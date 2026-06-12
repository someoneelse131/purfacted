import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';

const author = uniqueAccount('coma');
const replier = uniqueAccount('comb');
const claim = `Commented claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

let factUrl = '';

test('comment and reply on a fact', async ({ page, request }) => {
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Comments E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/comments-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Some source');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	factUrl = page.url();

	await page.getByLabel('Comment', { exact: true }).fill('Interesting claim, needs more data.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await expect(page.getByText('Interesting claim, needs more data.')).toBeVisible();

	// reply as a second user
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, replier);
	await page.goto(factUrl);
	await page.locator('summary', { hasText: 'Reply' }).click();
	await page.getByPlaceholder('Your reply...').fill('Agreed, the source is thin.');
	await page.getByRole('button', { name: 'Reply', exact: true }).click();

	const reply = page.getByTestId('comment').filter({ hasText: 'Agreed, the source is thin.' });
	await expect(reply.first()).toBeVisible();
	await expect(reply.last()).toHaveAttribute('data-depth', '2');
});

test('voting reorders sibling comments by weighted score', async ({ page }) => {
	// replier is still logged in from the previous test's context? No - fresh
	// context per test: log in again.
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(replier.username);
	await page.getByLabel('Password').fill(replier.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: replier.username })).toBeVisible();

	await page.goto(factUrl);
	// add a second root comment, then upvote it
	await page.getByLabel('Comment', { exact: true }).fill('Second opinion here.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	const second = page.getByTestId('comment').filter({ hasText: 'Second opinion here.' }).first();
	await second.getByRole('button', { name: 'upvote comment' }).click();

	// the upvoted root comment now sorts first
	const roots = page.locator('[data-testid="comment"][data-depth="1"]');
	await expect(roots.first()).toContainText('Second opinion here.');
	await expect(roots.first()).toContainText('score 1');
});

test('own comments can be edited and deleted', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(replier.username);
	await page.getByLabel('Password').fill(replier.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: replier.username })).toBeVisible();

	await page.goto(factUrl);
	const mine = page.getByTestId('comment').filter({ hasText: 'Second opinion here.' }).first();
	await mine.locator('summary', { hasText: 'Edit' }).first().click();
	const editForm = mine.locator('form[action="?/editComment"]');
	await editForm.getByRole('textbox').fill('Second opinion, refined.');
	await editForm.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Second opinion, refined.')).toBeVisible();
	await expect(page.getByText('· edited')).toBeVisible();

	const refined = page
		.getByTestId('comment')
		.filter({ hasText: 'Second opinion, refined.' })
		.first();
	await refined.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('[deleted]').first()).toBeVisible();
});
