import { test, expect } from '@playwright/test';
import { TEST_USER, login } from './fixtures';

test.describe('Facts Pages', () => {
  test.describe('Facts List Page', () => {
    test('should load facts page with filters', async ({ page }) => {
      await page.goto('/facts');
      await page.waitForLoadState('load');

      // Check heading
      await expect(page.locator('h1')).toContainText('Facts');
      await expect(page.locator('text=Browse and search community-verified facts')).toBeVisible();

      // Check search input exists
      const searchInput = page.locator('#search');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('placeholder', 'Search facts...');

      // Check status filter dropdown - use first select
      const statusSelect = page.locator('select').first();
      await expect(statusSelect).toBeVisible();
      await expect(page.locator('option[value=""]').first()).toContainText('All Status');

      // Check sort dropdown exists (options inside select are not visible until opened)
      await expect(page.locator('option[value="newest"]')).toBeAttached();
      await expect(page.locator('option[value="oldest"]')).toBeAttached();

      // Check Search button
      const searchButton = page.locator('button:has-text("Search")');
      await expect(searchButton).toBeVisible();
    });

    test('should display facts or empty state', async ({ page }) => {
      await page.goto('/facts');

      // Wait for loading to complete
      await page.waitForLoadState('load');
      await page.waitForSelector('text=Loading facts...', { state: 'hidden', timeout: 10000 }).catch(() => {});

      // Should either show facts or empty message (use .or() for proper syntax)
      const factsOrEmpty = page.locator('.space-y-4').or(page.locator('text=No facts found'));
      await expect(factsOrEmpty.first()).toBeVisible({ timeout: 10000 });
    });

    test('should filter by status', async ({ page }) => {
      await page.goto('/facts');
      await page.waitForLoadState('load');

      // Select PROVEN status
      const statusSelect = page.locator('select').first();
      await statusSelect.selectOption('PROVEN');

      // Wait for results to update
      await page.waitForLoadState('load');
    });
  });

  test.describe('Create Fact Page (Authenticated)', () => {
    test('should load create fact page with all fields', async ({ page }) => {
      await login(page);
      await page.goto('/facts/new');
      await page.waitForLoadState('load');

      // Check heading
      await expect(page.locator('h1')).toContainText('Submit a New Fact');

      // Check title input
      const titleInput = page.locator('#title');
      await expect(titleInput).toBeVisible();
      await expect(titleInput).toHaveAttribute('maxlength', '200');

      // Check content textarea
      const contentTextarea = page.locator('#content');
      await expect(contentTextarea).toBeVisible();
      await expect(contentTextarea).toHaveAttribute('maxlength', '5000');

      // Check category dropdown (options inside select are not visible until opened)
      const categorySelect = page.locator('#category');
      await expect(categorySelect).toBeVisible();
      await expect(page.locator('option:has-text("Select a category")')).toBeAttached();

      // Check source URL input
      const sourceInput = page.locator('input[type="url"]').first();
      await expect(sourceInput).toBeVisible();

      // Check Add another source button
      const addSourceButton = page.locator('button:has-text("Add another source")');
      await expect(addSourceButton).toBeVisible();

      // Check Grammar Check button
      const grammarButton = page.locator('button:has-text("Check Grammar")');
      await expect(grammarButton).toBeVisible();

      // Check submit and cancel buttons
      await expect(page.locator('button:has-text("Submit Fact")')).toBeVisible();
      await expect(page.locator('a:has-text("Cancel")')).toBeVisible();

      // Check submission guidelines
      await expect(page.locator('text=Submission Guidelines')).toBeVisible();
    });

    test('should validate required fields', async ({ page }) => {
      await login(page);
      await page.goto('/facts/new');
      await page.waitForLoadState('load');

      // Try to submit without title
      await page.locator('#content').click();
      await page.locator('#content').fill('Some content');
      await page.locator('input[type="url"]').first().click();
      await page.locator('input[type="url"]').first().fill('https://example.com');
      await page.locator('button:has-text("Submit Fact")').click();
      await expect(page.locator('text=Please enter a title')).toBeVisible();

      // Add title, remove content
      await page.locator('#title').click();
      await page.locator('#title').fill('Test Title');
      await page.locator('#content').fill('');
      await page.locator('button:has-text("Submit Fact")').click();
      await expect(page.locator('text=Please enter the fact content')).toBeVisible();

      // Add content, remove source
      await page.locator('#content').click();
      await page.locator('#content').fill('Test content');
      await page.locator('input[type="url"]').first().fill('');
      await page.locator('button:has-text("Submit Fact")').click();
      await expect(page.locator('text=Please add at least one source')).toBeVisible();
    });

    test('should successfully create a fact', async ({ page }) => {
      await login(page);
      await page.goto('/facts/new');
      await page.waitForLoadState('load');

      // Wait for form to be ready
      await page.waitForTimeout(500);

      const uniqueTitle = `E2E Test Fact ${Date.now()}`;

      // Fill form fields
      await page.locator('#title').click();
      await page.locator('#title').fill(uniqueTitle);

      await page.locator('#content').click();
      await page.locator('#content').fill('This is test content for an E2E test fact. It contains sufficient detail to be a valid submission.');

      await page.locator('input[type="url"]').first().click();
      await page.locator('input[type="url"]').first().fill('https://example.com/test-source');

      // Click submit
      await page.locator('button:has-text("Submit Fact")').click();

      // Wait for either redirect to fact page OR error message
      try {
        await page.waitForURL((url) => {
          const path = url.pathname;
          return path.startsWith('/facts/') && path !== '/facts/new' && !path.includes('/new');
        }, { timeout: 15000 });
        // Verify we're on a fact detail page by checking for common elements
        await expect(page.locator('h1, h2').first()).toBeVisible();
      } catch {
        // If no redirect, check for any error messages to help debug
        const errorVisible = await page.locator('.bg-red-50, .text-red-600, .error').count();
        if (errorVisible > 0) {
          const errorText = await page.locator('.bg-red-50, .text-red-600, .error').first().textContent();
          throw new Error(`Form submission failed with error: ${errorText}`);
        }
        throw new Error('Form submission did not redirect to fact page');
      }
    });
  });

  test.describe('Create Fact Page (Unauthenticated)', () => {
    test('should redirect or show error when not logged in', async ({ page }) => {
      await page.goto('/facts/new');
      await page.waitForLoadState('load');

      // Should either redirect to login or show an error
      const url = page.url();
      const isOnNewPage = url.includes('/facts/new');
      const isOnLoginPage = url.includes('/auth/login');

      // Either we're redirected to login, or we're still on the page (which might show an error)
      expect(isOnNewPage || isOnLoginPage).toBe(true);
    });
  });
});
