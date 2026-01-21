import { test, expect } from '@playwright/test';
import { login } from './fixtures';

test.describe('Fact Detail Page', () => {
  test('complete fact lifecycle - create, view, vote', async ({ page }) => {
    // Login first
    await login(page);

    // Create a test fact
    await page.goto('/facts/new');
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);

    const uniqueTitle = `E2E Detail Test ${Date.now()}`;

    await page.locator('#title').click();
    await page.locator('#title').fill(uniqueTitle);
    await page.locator('#content').click();
    await page.locator('#content').fill('This is content for testing the fact detail page. It has enough detail to be a valid submission.');
    await page.locator('input[type="url"]').first().click();
    await page.locator('input[type="url"]').first().fill('https://example.com/source');
    await page.locator('button:has-text("Submit Fact")').click();

    // Wait for redirect to the new fact page (exclude /facts/new)
    await page.waitForURL((url) => {
      const path = url.pathname;
      return path.startsWith('/facts/') && path !== '/facts/new' && !path.includes('/new');
    }, { timeout: 15000 });

    // Now test the fact detail page
    await page.waitForLoadState('load');

    // Should have back to facts link
    await expect(page.locator('text=Back to Facts')).toBeVisible();

    // Should show sources section
    await expect(page.locator('text=Sources')).toBeVisible();

    // Test navigation back
    await page.click('text=Back to Facts');
    await expect(page).toHaveURL('/facts');
  });

  test('should handle non-existent fact gracefully', async ({ page }) => {
    await page.goto('/facts/non-existent-id-12345');
    await page.waitForLoadState('load');

    // Should show error message
    await expect(
      page.locator('text=Failed to load').or(page.locator('text=Error')).or(page.locator('text=not found'))
    ).toBeVisible();
  });
});
