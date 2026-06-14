import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';

const author = uniqueAccount('bga');
const voter = uniqueAccount('bgv');
const claim = `Badge-earning claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('first source vote earns the First Verdict badge on the profile', async ({
	page,
	request
}) => {
	// author submits a fact with a starting source
	await registerVerifyLogin(page, request, author);
	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('Badge E2E.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/badge-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Some source');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();
	const factUrl = page.url();

	// voter has no badges yet
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, voter);
	await page.goto(`/users/${voter.username}`);
	await expect(page.getByTestId('badges')).toHaveCount(0);

	// voter casts their first source vote
	await page.goto(factUrl);
	await page.getByRole('button', { name: 'credible and supports its side' }).click();

	// the First Verdict badge now shows on the profile
	await page.goto(`/users/${voter.username}`);
	await expect(page.getByTestId('badges')).toBeVisible();
	await expect(page.getByText('First Verdict')).toBeVisible();
});
