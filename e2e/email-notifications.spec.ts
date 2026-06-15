import { expect, test } from '@playwright/test';
import { registerVerifyLogin, submitFactForReview, uniqueAccount, waitForMail } from './helpers';

// R33: an in-app notification event also produces a batched email. Author A
// gets a comment reply from B; flushing the batch sends A one aggregated mail.
test('a notification event produces a batched email', async ({ page, request, browser }) => {
	const author = uniqueAccount('emaila');
	const replier = uniqueAccount('emailb');
	const claim = `Email notification claim ${Date.now()} awaiting a reply`;

	// A: submit a fact and comment on it
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the email notification claim.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/email-notif/${Date.now()}`);
	await page.getByLabel('Source title').fill('Starting reference for the email notification claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	const factUrl = page.url();

	await page.getByLabel('Comment', { exact: true }).fill('My own take on this claim.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await expect(page.getByText('My own take on this claim.')).toBeVisible();

	// B (separate context): reply to A's comment -> queues a notification for A
	const bContext = await browser.newContext();
	const bPage = await bContext.newPage();
	await registerVerifyLogin(bPage, request, replier);
	await bPage.goto(factUrl);
	await bPage.locator('summary', { hasText: 'Reply' }).click();
	await bPage.getByPlaceholder('Your reply...').fill('Here is my reply to your comment.');
	await bPage.getByRole('button', { name: 'Reply', exact: true }).click();
	await expect(bPage.getByText('Here is my reply to your comment.')).toBeVisible();
	await bContext.close();

	// force a flush (window=0 -> ignore the rate window); the email worker then
	// delivers it into the dev mailbox
	const flush = await request.post('/api/dev/flush-email-notifications?window=0');
	expect(flush.ok()).toBe(true);

	const mail = await waitForMail(request, author.email, 'new update');
	expect(mail.text).toContain('Someone replied to your comment');
	expect(mail.text).toContain('/facts/');
});

// R33: a per-type opt-out suppresses that email. A disables the "comment reply"
// email in settings, then a reply produces no batched mail for that type.
test('a per-type opt-out suppresses the batched email', async ({ page, request, browser }) => {
	const author = uniqueAccount('emailc');
	const replier = uniqueAccount('emaild');
	const claim = `Opt-out email claim ${Date.now()} awaiting a reply`;

	await registerVerifyLogin(page, request, author);

	// turn OFF the "someone replies to my comment" email
	await page.goto('/account');
	const replyToggle = page
		.getByTestId('email-notify-types')
		.getByRole('checkbox', { name: 'Someone replies to my comment' });
	await replyToggle.uncheck();
	await page.getByRole('button', { name: 'Save settings' }).click();
	await expect(page.getByRole('status')).toBeVisible();
	// reload (a fresh request reads the saved prefs) and confirm it stuck
	await page.goto('/account');
	await expect(replyToggle).not.toBeChecked();

	// A: submit a fact and comment
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Context for the opt-out email claim.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/optout-notif/${Date.now()}`);
	await page.getByLabel('Source title').fill('Starting reference for the opt-out email claim');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	const factUrl = page.url();

	await page.getByLabel('Comment', { exact: true }).fill('My own take on this claim.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await expect(page.getByText('My own take on this claim.')).toBeVisible();

	// B replies
	const bContext = await browser.newContext();
	const bPage = await bContext.newPage();
	await registerVerifyLogin(bPage, request, replier);
	await bPage.goto(factUrl);
	await bPage.locator('summary', { hasText: 'Reply' }).click();
	await bPage.getByPlaceholder('Your reply...').fill('Here is my reply to your comment.');
	await bPage.getByRole('button', { name: 'Reply', exact: true }).click();
	await expect(bPage.getByText('Here is my reply to your comment.')).toBeVisible();
	await bContext.close();

	const flush = await request.post('/api/dev/flush-email-notifications?window=0');
	const { sent } = (await flush.json()) as { sent: number };
	// no batched mail for A (the only pending notification type is opted out)
	expect(sent).toBe(0);
});
