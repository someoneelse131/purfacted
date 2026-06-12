import { expect, test } from '@playwright/test';

test('homepage renders the PurFacted hero', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'PurFacted' })).toBeVisible();
	await expect(page.getByText(/community-evaluated\s+evidence/i)).toBeVisible();
});

test('health endpoint reports ok with db and redis up', async ({ request }) => {
	const res = await request.get('/api/health');
	expect(res.status()).toBe(200);
	const body = await res.json();
	expect(body.status).toBe('ok');
	expect(body.db).toBe('up');
	expect(body.redis).toBe('up');
});
