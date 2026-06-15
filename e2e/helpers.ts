import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Clicks the submit button on /submit and proceeds past the R27 duplicate-check
// panel if it appears. The dev database accumulates facts across runs, so many
// claims now surface a "Does this already exist?" prompt; tests that aren't
// specifically about dedup just proceed with "Submit anyway".
export async function submitFactForReview(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Submit for review' }).click();
	const proceedAnyway = page.getByRole('button', { name: 'Submit anyway' });
	if (await proceedAnyway.count()) {
		await proceedAnyway.click();
	}
}

export interface DevMail {
	subject: string;
	text: string;
}

export async function waitForMail(
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

export function extractLink(mail: DevMail, pathPart: string): string {
	const match = mail.text.match(new RegExp(`https?://[^\\s]*${pathPart}[^\\s]*`));
	if (!match) throw new Error(`No ${pathPart} link in mail: ${mail.text}`);
	return match[0];
}

export interface TestAccount {
	username: string;
	email: string;
	password: string;
}

export function uniqueAccount(prefix: string): TestAccount {
	const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	return {
		username: `${prefix}_${runId}`,
		email: `${prefix}_${runId}@example.com`,
		password: 'sturdy walrus pedals uphill'
	};
}

// Full register -> verify -> login flow; leaves the page logged in.
export async function registerVerifyLogin(
	page: Page,
	request: APIRequestContext,
	account: TestAccount
): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('Username').fill(account.username);
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: 'Sign up' }).click();
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

	const mail = await waitForMail(request, account.email, 'Verify');
	await page.goto(extractLink(mail, '/verify-email/'));
	await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

	await page.goto('/login');
	await page.getByLabel('Email or username').fill(account.username);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: 'Log in' }).click();
	await expect(page.getByRole('link', { name: account.username })).toBeVisible();
}
