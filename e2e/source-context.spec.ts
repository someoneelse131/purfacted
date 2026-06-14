import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { factIdByTitle, setSourceArchiveUrl } from './db-helpers';

// R26: source quote/justification is required and rendered in the evidence
// column; the archive.org snapshot, once stored, shows as an "archived copy"
// link. The archive job itself runs against a deterministic dev archiver in
// non-prod (no network), so the link is asserted via a stamped archiveUrl.

const author = uniqueAccount('src-ctx');
const claim = `Source context claim ${Date.now().toString(36)}`;
const quote = 'The cited meta-analysis reports a clear protective effect at moderate doses.';

test.describe.configure({ mode: 'serial' });

test('submitting a fact requires a source quote and renders it', async ({ page, request }) => {
	await registerVerifyLogin(page, request, author);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('A claim used to exercise source context.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/src-ctx-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Meta-analysis source');

	// the quote field is present and required
	const quoteField = page.getByLabel('Supporting quote');
	await expect(quoteField).toHaveAttribute('required', '');
	await quoteField.fill(quote);

	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	// the quote is rendered on the source card
	await expect(page.getByTestId('source-quote')).toContainText(quote);
});

test('a stored archive snapshot shows as an "archived copy" link', async ({ page }) => {
	const archiveUrl = 'https://web.archive.org/web/20260614/https://example.org/src-ctx';
	await setSourceArchiveUrl(claim, archiveUrl);

	const factId = await factIdByTitle(claim);
	await page.goto(`/facts/${factId}`);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	const link = page.getByTestId('source-archive-link');
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute('href', archiveUrl);
});
