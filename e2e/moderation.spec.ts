import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount, waitForMail } from './helpers';
import { promoteToModerator } from './db-helpers';

const author = uniqueAccount('moda');
const reporter = uniqueAccount('modr');
const moderator = uniqueAccount('modm');
const claim = `Reported spammy claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('report -> queue -> resolve -> reporter notification (R17)', async ({ page, request }) => {
	// author creates the offending fact
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Moderation E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/mod-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Thin source');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	const factUrl = page.url();

	// reporter files a report
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reporter);
	await page.goto(factUrl);
	await page.locator('summary', { hasText: 'Report this fact' }).click();
	await page.getByLabel('Reason').selectOption('misinformation');
	await page.getByLabel('Details (optional)').fill('No real source behind it.');
	await page.getByRole('button', { name: 'Send report' }).click();
	await expect(page.getByText('Report sent')).toBeVisible();

	// moderator claims and removes via the queue
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, moderator);
	await promoteToModerator(moderator.username);
	await page.goto('/moderation');
	const row = page.getByTestId('report-row').filter({ hasText: claim });
	await expect(row).toBeVisible();
	await expect(row).toContainText('misinformation');
	await row.getByRole('button', { name: 'Claim' }).click();
	await expect(
		page
			.getByTestId('report-row')
			.filter({ hasText: claim })
			.getByText(/claimed by/)
	).toBeVisible();
	await page
		.getByTestId('report-row')
		.filter({ hasText: claim })
		.getByRole('button', { name: 'Remove content' })
		.click();
	await expect(page.getByTestId('report-row').filter({ hasText: claim })).toHaveCount(0);

	// action log shows the resolution
	await expect(page.getByText('resolve_report_removed').first()).toBeVisible();

	// the fact is gone from public view
	const res = await page.goto(factUrl);
	expect(res?.status()).toBe(404);

	// the reporter receives a notification mail (queued, worker delivers)
	const mail = await waitForMail(request, reporter.email, 'report was reviewed');
	expect(mail.text).toContain('removed');
});
