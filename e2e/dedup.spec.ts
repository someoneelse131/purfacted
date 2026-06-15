import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { factIdByTitle, promoteToModerator } from './db-helpers';

// R27: the submit flow surfaces similar existing claims before creation
// ("Does this already exist?"); the submitter may proceed anyway. A moderator
// can then merge a fact into a canonical one, after which the duplicate's page
// redirects to the canonical.

const runId = Date.now().toString(36);
const author = uniqueAccount('dedup-author');
const moderator = uniqueAccount('dedup-mod');
const canonicalTitle = `Vitamin C prevents the common cold ${runId}`;
const duplicateTitle = `Vitamin C prevents the common cold entirely ${runId}`;
const quote = 'The cited trial reports a strong reduction in cold incidence among participants.';

test.describe.configure({ mode: 'serial' });

async function fillSourceFields(page: import('@playwright/test').Page) {
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/dedup-${runId}-${Math.random()}`);
	await page.getByLabel('Source title').fill('Trial source');
	await page.getByLabel('Supporting quote').fill(quote);
}

test('submitting a similar claim shows existing facts and lets the user proceed', async ({
	page,
	request
}) => {
	await registerVerifyLogin(page, request, author);

	// 1. canonical claim. The seeded corpus may already hold loosely similar
	// claims, so proceed through the panel if it appears.
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(canonicalTitle);
	await page.getByLabel('Context').fill('Baseline claim for duplicate detection.');
	await fillSourceFields(page);
	await page.getByRole('button', { name: 'Submit for review' }).click();
	const canonicalHeading = page.getByRole('heading', { name: canonicalTitle });
	const firstPanel = page.getByTestId('similar-facts');
	// wait for whichever outcome the POST produced, then proceed through a panel
	await expect(firstPanel.or(canonicalHeading)).toBeVisible();
	if (await firstPanel.isVisible()) {
		await page.getByRole('button', { name: 'Submit anyway' }).click();
	}
	await expect(canonicalHeading).toBeVisible();

	// 2. a near-identical claim triggers the "Does this already exist?" panel
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(duplicateTitle);
	await page.getByLabel('Context').fill('Near-duplicate claim for duplicate detection.');
	await fillSourceFields(page);
	await page.getByRole('button', { name: 'Submit for review' }).click();

	const panel = page.getByTestId('similar-facts');
	await expect(panel).toBeVisible();
	await expect(panel.getByRole('link', { name: canonicalTitle })).toBeVisible();

	// 3. proceed anyway - the duplicate claim is created
	await page.getByRole('button', { name: 'Submit anyway' }).click();
	await expect(page.getByRole('heading', { name: duplicateTitle })).toBeVisible();
});

test('a moderator merge redirects the duplicate page to the canonical fact', async ({
	page,
	request
}) => {
	const canonicalId = await factIdByTitle(canonicalTitle);
	const duplicateId = await factIdByTitle(duplicateTitle);

	await registerVerifyLogin(page, request, moderator);
	// role is read from the DB per request, so promoting after login is enough
	await promoteToModerator(moderator.username);

	await page.goto(`/facts/${duplicateId}`);
	await page.getByRole('heading', { name: duplicateTitle }).waitFor();

	// expand the moderator merge control and merge into the canonical fact
	await page.getByText('Mark as duplicate').click();
	await page.getByLabel('Canonical fact (URL or id)').fill(`/facts/${canonicalId}`);
	await page.getByRole('button', { name: 'Merge into canonical' }).click();

	// merge redirects to the canonical fact
	await expect(page).toHaveURL(`/facts/${canonicalId}`);
	await expect(page.getByRole('heading', { name: canonicalTitle })).toBeVisible();

	// visiting the duplicate URL now redirects to the canonical
	await page.goto(`/facts/${duplicateId}`);
	await expect(page).toHaveURL(`/facts/${canonicalId}`);
	await expect(page.getByRole('heading', { name: canonicalTitle })).toBeVisible();
});
