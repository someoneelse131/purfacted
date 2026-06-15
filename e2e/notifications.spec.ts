import { expect, test } from '@playwright/test';
import { registerVerifyLogin, submitFactForReview, uniqueAccount } from './helpers';

// R32: an event for you -> a live notification appears (SSE) -> mark it read.
// We use the "reply to your comment" path: author A keeps a page open with the
// notification bell while user B replies to A's comment in a separate context.

test('a reply produces a live notification that can be marked read', async ({
	page,
	request,
	browser
}) => {
	const author = uniqueAccount('notia');
	const replier = uniqueAccount('notib');
	const claim = `Notification claim ${Date.now()} awaiting a reply`;

	// A: submit a fact and post a comment on it
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the notification claim.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/notif/${Date.now()}`);
	await page.getByLabel('Source title').fill('Starting reference for the notification claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	const factUrl = page.url();

	await page.getByLabel('Comment', { exact: true }).fill('My own take on this claim.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await expect(page.getByText('My own take on this claim.')).toBeVisible();

	// A starts with no unread notifications
	await expect(page.getByTestId('notif-count')).toHaveCount(0);

	// B (separate context): reply to A's comment
	const bContext = await browser.newContext();
	const bPage = await bContext.newPage();
	await registerVerifyLogin(bPage, request, replier);
	await bPage.goto(factUrl);
	await bPage.locator('summary', { hasText: 'Reply' }).click();
	await bPage.getByPlaceholder('Your reply...').fill('Here is my reply to your comment.');
	await bPage.getByRole('button', { name: 'Reply', exact: true }).click();
	await expect(bPage.getByText('Here is my reply to your comment.')).toBeVisible();
	await bContext.close();

	// A's open page receives the notification live over SSE
	await expect(page.getByTestId('notif-count')).toHaveText('1', { timeout: 15_000 });

	// open the bell, see the reply notification, mark all read -> count clears
	await page.getByTestId('notif-bell').click();
	const dropdown = page.getByTestId('notif-dropdown');
	await expect(dropdown.getByText('Someone replied to your comment')).toBeVisible();
	await dropdown.getByTestId('notif-mark-all').click();
	await expect(page.getByTestId('notif-count')).toHaveCount(0);
});
