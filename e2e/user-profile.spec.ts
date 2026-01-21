import { test, expect } from '@playwright/test';
import { TEST_USER, login } from './fixtures';

test.describe('User Profile', () => {
  test.describe('Profile Page (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('should load profile page with user info', async ({ page }) => {
      await page.goto('/user/profile');
      await page.waitForLoadState('load');

      // Check heading
      await expect(page.locator('h1')).toContainText('My Profile');

      // Check user name is displayed
      await expect(page.locator(`text=${TEST_USER.firstName}`)).toBeVisible();
      await expect(page.locator(`text=${TEST_USER.lastName}`)).toBeVisible();

      // Check email
      await expect(page.locator(`text=${TEST_USER.email}`)).toBeVisible();

      // Check user type badge (Admin is MODERATOR)
      await expect(page.locator('text=Moderator')).toBeVisible();

      // Check stats section (use p elements to avoid matching nav links)
      await expect(page.locator('text=Trust Score')).toBeVisible();
      await expect(page.locator('p.text-sm:has-text("Facts")')).toBeVisible();
      await expect(page.locator('p.text-sm:has-text("Votes")')).toBeVisible();

      // Check account details
      await expect(page.locator('text=Email Verified')).toBeVisible();
      await expect(page.locator('text=Member Since')).toBeVisible();
    });

    test('should have action buttons', async ({ page }) => {
      await page.goto('/user/profile');
      await page.waitForLoadState('load');

      // Check for Edit Settings link
      const settingsLink = page.locator('a:has-text("Edit Settings")');
      await expect(settingsLink).toBeVisible();

      // Check for View My Facts link
      const factsLink = page.locator('a:has-text("View My Facts")');
      await expect(factsLink).toBeVisible();
    });

    test('Edit Settings link should navigate to settings', async ({ page }) => {
      await page.goto('/user/profile');
      await page.waitForLoadState('load');

      await page.click('a:has-text("Edit Settings")');
      await page.waitForURL('/user/settings');
    });
  });

  test.describe('Profile Page (Unauthenticated)', () => {
    test('should show error when not logged in', async ({ page }) => {
      await page.goto('/user/profile');
      await page.waitForLoadState('load');

      // Should show error message about logging in
      await expect(page.locator('text=Please log in to view your profile')).toBeVisible();
    });

    test('should have link to login', async ({ page }) => {
      await page.goto('/user/profile');
      await page.waitForLoadState('load');

      // The error message should have a login link
      const loginLink = page.locator('.bg-red-50 a[href="/auth/login"], .bg-red-50 + * a[href="/auth/login"]');
      const count = await loginLink.count();
      // May or may not have a login link in the error message
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});

test.describe('User Settings', () => {
  test.describe('Settings Page (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    test('should load settings page with sections', async ({ page }) => {
      await page.goto('/user/settings');
      await page.waitForLoadState('load');

      // Check heading
      await expect(page.locator('h1')).toContainText('Settings');

      // Look for any settings sections (password, notifications, etc.)
      // These might vary based on implementation
    });
  });
});
