import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { activityEventsForFact, factIdByTitle } from './db-helpers';

// The activity spine (R25) has no UI yet (it feeds R30-R33/R38). This E2E
// drives the real user flow that produces events - submitting a claim and
// commenting on it - and verifies the spine recorded them by reading the
// table directly (the same approach as other no-UI fixtures here).

const author = uniqueAccount('act-author');
const commenter = uniqueAccount('act-commenter');
const claim = `Activity spine claim ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('submitting a claim records a fact_submitted event', async ({ page, request }) => {
	await registerVerifyLogin(page, request, author);

	await page.goto('/submit');
	await page.getByLabel('Claim').fill(claim);
	await page.getByLabel('Context').fill('A claim used to exercise the activity spine.');
	await page.getByLabel('Category').selectOption({ label: 'Science' });
	await page.getByLabel('URL').fill(`https://example.org/activity-${Date.now().toString(36)}`);
	await page.getByLabel('Source title').fill('Spine source');
	await page
		.getByLabel('Supporting quote')
		.fill('The cited section of this source backs the claim with explicit data.');
	await page.getByRole('button', { name: 'Submit for review' }).click();
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	const factId = await factIdByTitle(claim);
	const events = await activityEventsForFact(factId);
	const submitted = events.find((e) => e.type === 'fact_submitted');
	expect(submitted).toBeDefined();
	expect(submitted?.subjectType).toBe('FACT');
	expect(submitted?.actorId).not.toBeNull();
});

test('commenting on the claim records a comment_added event', async ({ page, request }) => {
	await registerVerifyLogin(page, request, commenter);

	const factId = await factIdByTitle(claim);
	await page.goto(`/facts/${factId}`);
	await expect(page.getByRole('heading', { name: claim })).toBeVisible();

	await page.getByLabel('Comment', { exact: true }).fill('Tracking this via the activity spine.');
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await expect(
		page.getByText('Tracking this via the activity spine.', { exact: false })
	).toBeVisible();

	const events = await activityEventsForFact(factId);
	const comment = events.find((e) => e.type === 'comment_added');
	expect(comment).toBeDefined();
	expect(comment?.subjectType).toBe('COMMENT');
});
