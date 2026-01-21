import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Check main heading
    await expect(page.locator('h1')).toContainText('Verify Facts Together');

    // Check hero section content
    await expect(page.locator('text=A community-driven platform')).toBeVisible();

    // Check main navigation buttons
    await expect(page.locator('a[href="/facts"]').first()).toBeVisible();
  });

  test('should show Sign In and Register links when not logged in', async ({ page }) => {
    await page.goto('/');

    // Check for Join Now button in hero
    await expect(page.locator('a[href="/auth/register"]').first()).toBeVisible();

    // Check footer links
    await expect(page.locator('footer a[href="/auth/login"]')).toBeVisible();
    await expect(page.locator('footer a[href="/auth/register"]')).toBeVisible();
  });

  test('should have working Browse Facts link', async ({ page }) => {
    await page.goto('/');

    await page.click('a[href="/facts"]');
    await page.waitForURL('/facts');

    await expect(page.locator('h1')).toContainText('Facts');
  });

  test('should have How It Works section', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=How It Works')).toBeVisible();
    await expect(page.locator('text=Submit Facts')).toBeVisible();
    await expect(page.locator('text=Verify Together')).toBeVisible();
    await expect(page.locator('text=Discuss & Debate')).toBeVisible();
  });

  test('should have Trust-Based Verification section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Trust-Based Verification')).toBeVisible();
    await expect(page.locator('text=Vote Weight by User Type')).toBeVisible();

    // Check weight displays - use exact match for items that appear multiple times
    await expect(page.getByText('Organization', { exact: true })).toBeVisible();
    await expect(page.locator('text=100x')).toBeVisible();
    // PhD might render with different whitespace, so use flexible match
    await expect(page.getByText('PhD', { exact: true })).toBeVisible();
    await expect(page.locator('text=8x')).toBeVisible();
  });

  test('should have footer with legal links', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('footer a[href="/terms"]')).toBeVisible();
  });

  test('should navigate to categories page', async ({ page }) => {
    await page.goto('/');

    await page.click('footer a[href="/categories"]');
    await page.waitForURL('/categories');
  });

  test('should navigate to debates page', async ({ page }) => {
    await page.goto('/');

    await page.click('footer a[href="/debates"]');
    await page.waitForURL('/debates');
  });

  test('should navigate to stats page', async ({ page }) => {
    await page.goto('/');

    await page.click('footer a[href="/stats"]');
    await page.waitForURL('/stats');
  });
});
