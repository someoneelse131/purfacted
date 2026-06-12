import { expect, test, type APIRequestContext } from '@playwright/test';

// Unique suffix per run - the dev database is not wiped between E2E runs.
const runId = Date.now().toString(36);
const username = `e2e_${runId}`;
const email = `e2e_${runId}@example.com`;
const password = 'sturdy walrus pedals uphill';
const newPassword = 'sturdy walrus rolls downhill';

interface DevMail {
	subject: string;
	text: string;
}

async function waitForMail(
	request: APIRequestContext,
	to: string,
	subjectPart: string
): Promise<DevMail> {
	let found: DevMail | undefined;
	await expect
		.poll(
			async () => {
				const res = await request.get(`/api/dev/mailbox?to=${encodeURIComponent(to)}`);
				if (!res.ok()) return false;
				const { mails } = (await res.json()) as { mails: DevMail[] };
				found = mails.find((m) => m.subject.includes(subjectPart));
				return Boolean(found);
			},
			{ timeout: 30_000, message: `mail "${subjectPart}" for ${to}` }
		)
		.toBe(true);
	return found as DevMail;
}

function extractLink(mail: DevMail, pathPart: string): string {
	const match = mail.text.match(new RegExp(`https?://[^\\s]*${pathPart}[^\\s]*`));
	if (!match) throw new Error(`No ${pathPart} link in mail: ${mail.text}`);
	return match[0];
}

test.describe.configure({ mode: 'serial' });

test('register -> verify email -> login -> session persists -> logout', async ({
	page,
	request
}) => {
	// register
	await page.goto('/register');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

	// receive verification mail via dev mailbox and open the link
	const mail = await waitForMail(request, email, 'Verify');
	await page.goto(extractLink(mail, '/verify-email/'));
	await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

	// login (CTA on the verification page, not the header link)
	await page.locator('main').getByRole('link', { name: 'Log in' }).click();
	await page.getByLabel('Email or username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: username })).toBeVisible();

	// session persists across reload
	await page.reload();
	await expect(page.getByRole('link', { name: username })).toBeVisible();

	// logout
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
});

test('password reset flow sets a new password', async ({ page, request }) => {
	await page.goto('/forgot-password');
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Send reset link' }).click();
	await expect(page.getByText('reset link is on its way')).toBeVisible();

	const mail = await waitForMail(request, email, 'Reset');
	await page.goto(extractLink(mail, '/reset-password/'));
	await page.getByLabel('New password').fill(newPassword);
	await page.getByRole('button', { name: 'Set password' }).click();
	await expect(page).toHaveURL(/\/login/);

	// old password no longer works
	await page.getByLabel('Email or username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByText('Invalid credentials.')).toBeVisible();

	// new password works
	await page.getByLabel('Password').fill(newPassword);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: username })).toBeVisible();
});

test('change password from the account page', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email or username').fill(username);
	await page.getByLabel('Password').fill(newPassword);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: username })).toBeVisible();

	await page.goto('/account');
	await page.getByLabel('Current password').fill(newPassword);
	await page.getByLabel('New password').fill(password);
	await page.getByRole('button', { name: 'Change password' }).click();
	await expect(page.getByText('Password changed.')).toBeVisible();
});

// Keep last: five failed logins lock the shared localhost IP for the window.
test('rate limit triggers after repeated failed logins', async ({ page }) => {
	await page.goto('/login');
	// Earlier tests may already have recorded failed attempts against the
	// shared localhost IP; keep failing until the lockout message appears.
	for (let i = 0; i < 7; i++) {
		await page.getByLabel('Email or username').fill(username);
		await page.getByLabel('Password').fill('definitely wrong password');
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page.getByRole('alert')).toBeVisible();
		if ((await page.getByRole('alert').textContent())?.includes('Too many')) break;
	}
	await expect(page.getByText('Too many failed attempts')).toBeVisible();

	// the lockout also blocks the correct password
	await page.getByLabel('Email or username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByText('Too many failed attempts')).toBeVisible();
});
