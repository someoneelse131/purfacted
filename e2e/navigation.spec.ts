import { test, expect } from '@playwright/test';
import { login } from './fixtures';

test.describe('Navigation', () => {
  test('should have all navigation elements and links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for main navigation in header
    await expect(page.locator('header, nav').first()).toBeVisible();

    // Check for login/register links when not authenticated
    await expect(page.locator('a[href="/auth/login"]').first()).toBeVisible();
    await expect(page.locator('a[href="/auth/register"]').first()).toBeVisible();

    // Check footer links
    await expect(page.locator('footer a[href="/facts"]')).toBeVisible();
    await expect(page.locator('footer a[href="/categories"]')).toBeVisible();
    await expect(page.locator('footer a[href="/debates"]')).toBeVisible();
    await expect(page.locator('footer a[href="/stats"]')).toBeVisible();
    await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('footer a[href="/terms"]')).toBeVisible();

    // Check copyright
    const currentYear = new Date().getFullYear().toString();
    await expect(page.locator(`footer:has-text("${currentYear}")`)).toBeVisible();
    await expect(page.locator('footer:has-text("PurFacted")')).toBeVisible();
  });

  test('should navigate between main pages', async ({ page }) => {
    // Start at home
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to facts
    await page.click('a[href="/facts"]');
    await expect(page).toHaveURL('/facts');
    await expect(page.locator('h1')).toBeVisible();

    // Navigate back to home
    await page.goto('/');
    await expect(page).toHaveURL('/');
  });

  test('pages should load correctly', async ({ page }) => {
    // Categories page
    await page.goto('/categories');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();

    // Debates page
    await page.goto('/debates');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();

    // Stats page
    await page.goto('/stats');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();

    // Privacy page
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();

    // Terms page
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('authenticated navigation shows profile links', async ({ page }) => {
    await login(page);

    // Should be able to access profile directly
    await page.goto('/user/profile');
    await page.waitForLoadState('load');
    await expect(page.locator('h1')).toContainText('Profile');

    // Should be able to access settings
    await page.goto('/user/settings');
    await page.waitForLoadState('load');
    await expect(page.locator('h1')).toContainText('Settings');

    // Should be able to access create fact page
    await page.goto('/facts/new');
    await page.waitForLoadState('load');
    await expect(page.locator('h1')).toContainText('Submit');
  });
});
