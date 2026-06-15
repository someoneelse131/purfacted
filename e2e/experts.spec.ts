import { expect, test } from '@playwright/test';
import { registerVerifyLogin, uniqueAccount } from './helpers';
import { promoteToAdmin } from './db-helpers';

// R34: apply -> moderator review -> role EXPERT + "Expert: <field>" badge ->
// admin revoke. The vote-weight-only-in-field rule is covered by the
// integration tests; this exercises the end-to-end application flow + UI.

const applicant = uniqueAccount('expa');
const reviewer = uniqueAccount('expm');
const field = `Climate science ${Date.now().toString(36)}`;

test.describe.configure({ mode: 'serial' });

test('expert verification: apply, approve, badge, revoke (R34)', async ({ page, request }) => {
	// applicant submits an expert application with a credential upload
	await registerVerifyLogin(page, request, applicant);
	await page.goto('/expert');
	await page.getByLabel('Your field / specialty').fill(field);
	await page.getByTestId('expert-categories').getByText('Science', { exact: true }).click();
	await page.getByLabel(/Credential/).setInputFiles({
		name: 'diploma.pdf',
		mimeType: 'application/pdf',
		buffer: Buffer.from('%PDF-1.4 fake credential')
	});
	await page.getByRole('button', { name: 'Submit application' }).click();
	await expect(page.getByText('Application submitted')).toBeVisible();
	await expect(page.getByTestId('application-status')).toContainText('Pending review');

	// reviewer (admin, which also satisfies the moderator guard) approves it
	await page.getByRole('button', { name: 'Log out' }).click();
	await registerVerifyLogin(page, request, reviewer);
	await promoteToAdmin(reviewer.username);
	await page.goto('/moderation?tab=experts');
	const row = page.getByTestId('expert-application-row').filter({ hasText: applicant.username });
	await expect(row).toBeVisible();
	await expect(row).toContainText(field);
	// the credential link points at the moderator-only download route
	await expect(row.getByRole('link', { name: /View credential/ })).toBeVisible();
	await row.getByRole('button', { name: 'Approve' }).click();
	await expect(row).toBeHidden();

	// the applicant's public profile now shows the Expert role + field badge
	await page.goto(`/users/${applicant.username}`);
	await expect(page.locator('.chip-primary', { hasText: 'Expert' }).first()).toBeVisible();
	await expect(page.getByTestId('badges')).toContainText(`Expert: ${field}`);

	// admin revokes expert status from the profile
	await page.getByTestId('revoke-expert').click();
	await expect(page.getByText('Expert status revoked')).toBeVisible();
	await page.goto(`/users/${applicant.username}`);
	await expect(page.getByTestId('badges')).toBeHidden();
});
