import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount, submitFactForReview } from './helpers';
import { addSameSecondSource } from './db-helpers';

// Regression (Karte 3 acceptance): clicking the author link on a fact did
// nothing - the address bar jumped to /users/<name> but the profile never
// rendered. Root cause: the profile's activity {#each} keyed on
// `type + factId + createdAt`, and string-concatenating a Date drops
// milliseconds, so two activity events on the same fact within the same second
// produced an identical key. Svelte threw `each_key_duplicate` during the
// client-side render, aborting it. This drives the exact flow: a profile with a
// same-second collision, reached via in-app (client-side) navigation.

const author = uniqueAccount('profrender');
const claim = `Same-second activity claim ${Date.now().toString(36)}`;

test('author link opens the profile even with same-second activity', async ({ page, request }) => {
	await registerVerifyLogin(page, request, author);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('A claim used to exercise same-second activity rendering.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/profrender-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('First source');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await submitFactForReview(page);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	// second activity event on the same fact, same second as the first source
	await addSameSecondSource(claim);

	// reload the fact page so the author link is present, then navigate
	// client-side (a real click, not page.goto) - that is the path that crashed.
	await page.reload();
	const pageErrors: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	// target the "Submitted by" author link specifically (the header also shows
	// the logged-in username, linking to /account)
	await page.locator(`a[href="/users/${author.username}"]`).first().click();

	// the profile must actually render, not leave us stuck on the fact page
	await expect(page).toHaveURL(new RegExp(`/users/${author.username}$`));
	await expect(page.getByRole('heading', { name: author.username, level: 1 })).toBeVisible();
	await expect(page.getByTestId('verification-activity')).toBeVisible();
	expect(pageErrors.join('\n')).not.toContain('each_key_duplicate');
});
