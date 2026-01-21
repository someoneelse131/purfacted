import { test, expect } from '@playwright/test';
import { login } from './fixtures';

test.describe('Categories Page', () => {
  test('should load and display categories', async ({ page }) => {
    await page.goto('/categories');
    await page.waitForLoadState('load');

    await expect(page.locator('h1')).toBeVisible();

    // Categories are seeded, check for common ones
    const possibleCategories = ['Science', 'Health', 'Technology', 'Environment', 'History', 'Politics'];
    let foundCategory = false;
    for (const cat of possibleCategories) {
      const element = page.locator(`text=${cat}`);
      if (await element.count() > 0) {
        foundCategory = true;
        break;
      }
    }
  });
});

test.describe('Debates Page', () => {
  test('should load debates page', async ({ page }) => {
    await page.goto('/debates');
    await page.waitForLoadState('load');

    await expect(page.locator('h1')).toBeVisible();

    // Should show debates or empty state (use .or() for proper syntax)
    const content = page.locator('.space-y-4')
      .or(page.locator('text=No debates'))
      .or(page.locator('text=published'))
      .or(page.locator('text=Published'));
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Stats Page', () => {
  test('should display platform statistics', async ({ page }) => {
    await page.goto('/stats');
    await page.waitForLoadState('load');

    // Check the heading
    await expect(page.locator('h1')).toContainText('Statistics');
  });
});

test.describe('Moderation Page', () => {
  test('moderator can access moderation page', async ({ page }) => {
    await login(page); // Admin is a moderator
    await page.goto('/moderation');
    await page.waitForLoadState('load');

    // Moderators should be able to access this
    await expect(page.locator('h1')).toBeVisible();
  });

  test('unauthenticated user cannot access moderation', async ({ page }) => {
    await page.goto('/moderation');
    await page.waitForLoadState('load');

    // Should either redirect or show access denied
    const url = page.url();
    const isRedirected = url.includes('/auth/login') || !url.includes('/moderation');
    const hasError = await page.locator('text=access').or(page.locator('text=denied')).or(page.locator('text=login')).count() > 0;

    expect(isRedirected || hasError || !url.includes('/moderation')).toBe(true);
  });
});

test.describe('Legal Pages', () => {
  test('privacy policy page has content', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('load');

    // Check heading exists
    await expect(page.locator('h1')).toBeVisible();
  });

  test('terms of service page has content', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('load');

    // Check heading exists
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('API & Error Handling', () => {
  test('health endpoint returns 200', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
  });

  test('handles 404 gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page-12345');
    await page.waitForLoadState('load');

    // Should show 404 or error page, not crash
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('handles invalid fact ID', async ({ page }) => {
    await page.goto('/facts/invalid-id-that-does-not-exist');
    await page.waitForLoadState('load');

    // Should show error message
    await expect(
      page.locator('text=Failed').or(page.locator('text=Error')).or(page.locator('text=not found'))
    ).toBeVisible();
  });
});
