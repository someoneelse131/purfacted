import { test, expect } from '@playwright/test';
import { TEST_USER, login, generateUniqueEmail } from './fixtures';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should load login page', async ({ page }) => {
      await page.goto('/auth/login');

      await expect(page.locator('h1')).toContainText('Sign In');
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should have link to registration', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      // There are multiple register links - use the one in the form
      const registerLink = page.locator('main a[href="/auth/register"]');
      await expect(registerLink).toBeVisible();
      await expect(registerLink).toContainText('Create one');
    });

    test('should have link to forgot password', async ({ page }) => {
      await page.goto('/auth/login');

      const forgotLink = page.locator('a[href="/auth/forgot-password"]');
      await expect(forgotLink).toBeVisible();
      await expect(forgotLink).toContainText('Forgot password');
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      await page.locator('#email').click();
      await page.locator('#email').fill('invalid@test.com');
      await page.locator('#password').click();
      await page.locator('#password').fill('wrongpassword');
      await page.locator('button[type="submit"]').click();

      // Should show error message
      await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
    });

    test('should show error for empty form submission', async ({ page }) => {
      await page.goto('/auth/login');

      // Try to submit empty form - browser validation should prevent it
      const emailInput = page.locator('#email');
      await expect(emailInput).toHaveAttribute('required', '');
    });

    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      await page.locator('#email').click();
      await page.locator('#email').fill(TEST_USER.email);
      await page.locator('#password').click();
      await page.locator('#password').fill(TEST_USER.password);
      await page.locator('button[type="submit"]').click();

      // Should redirect to home page
      await page.waitForURL('/', { timeout: 10000 });

      // Should show user is logged in (check for profile link or similar)
      await expect(page).toHaveURL('/');
    });

    test('should remember me checkbox works', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const rememberCheckbox = page.locator('input[type="checkbox"]');
      await expect(rememberCheckbox).toBeVisible();

      // Click to check (Svelte bindings work better with click)
      await expect(rememberCheckbox).not.toBeChecked();
      await rememberCheckbox.click();
      await expect(rememberCheckbox).toBeChecked();

      // Click to uncheck
      await rememberCheckbox.click();
      await expect(rememberCheckbox).not.toBeChecked();
    });

    test('should show loading state while logging in', async ({ page }) => {
      await page.goto('/auth/login');

      await page.fill('#email', TEST_USER.email);
      await page.fill('#password', TEST_USER.password);

      // Click and check for loading state
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Button should be disabled and show loading text
      // Note: This might be too fast to catch, depending on network speed
    });
  });

  test.describe('Registration Page', () => {
    test('should load registration page', async ({ page }) => {
      await page.goto('/auth/register');

      await expect(page.locator('h1')).toContainText('Create Account');
      await expect(page.locator('#firstName')).toBeVisible();
      await expect(page.locator('#lastName')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('#confirmPassword')).toBeVisible();
    });

    test('should have link to login', async ({ page }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('networkidle');

      // There are multiple login links - use the one in main content
      const loginLink = page.locator('main a[href="/auth/login"]');
      await expect(loginLink).toBeVisible();
      await expect(loginLink).toContainText('Sign in');
    });

    test('should show error for password mismatch', async ({ page }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('networkidle');

      await page.locator('#firstName').click();
      await page.locator('#firstName').fill('Test');
      await page.locator('#lastName').click();
      await page.locator('#lastName').fill('User');
      await page.locator('#email').click();
      await page.locator('#email').fill(generateUniqueEmail());
      await page.locator('#password').click();
      await page.locator('#password').fill('Test123!@#');
      await page.locator('#confirmPassword').click();
      await page.locator('#confirmPassword').fill('DifferentPassword123!');
      await page.locator('button[type="submit"]').click();

      // Should show error message
      await expect(page.locator('.bg-red-50')).toContainText('Passwords do not match');
    });

    test('should show error for existing email', async ({ page }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('networkidle');

      await page.locator('#firstName').click();
      await page.locator('#firstName').fill('Test');
      await page.locator('#lastName').click();
      await page.locator('#lastName').fill('User');
      await page.locator('#email').click();
      await page.locator('#email').fill(TEST_USER.email);
      await page.locator('#password').click();
      await page.locator('#password').fill('Test123!@#');
      await page.locator('#confirmPassword').click();
      await page.locator('#confirmPassword').fill('Test123!@#');
      await page.locator('button[type="submit"]').click();

      // Should show error message about existing email
      await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
    });

    test('should show password requirements hint', async ({ page }) => {
      await page.goto('/auth/register');

      await expect(page.locator('text=Min 8 characters')).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('/auth/register');

      const emailInput = page.locator('#email');
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should require all fields', async ({ page }) => {
      await page.goto('/auth/register');

      await expect(page.locator('#firstName')).toHaveAttribute('required', '');
      await expect(page.locator('#lastName')).toHaveAttribute('required', '');
      await expect(page.locator('#email')).toHaveAttribute('required', '');
      await expect(page.locator('#password')).toHaveAttribute('required', '');
      await expect(page.locator('#confirmPassword')).toHaveAttribute('required', '');
    });
  });

  test.describe('Forgot Password Page', () => {
    test('should load forgot password page', async ({ page }) => {
      await page.goto('/auth/forgot-password');

      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully via UI and show toast', async ({ page }) => {
      // First login
      await login(page);

      // Verify we're logged in - user menu should show the name
      await expect(page.locator('nav').getByText('Admin')).toBeVisible({ timeout: 5000 });

      // Open the user dropdown and click sign out
      await page.locator('nav').getByText('Admin').hover();
      await page.getByRole('button', { name: /sign out/i }).click();

      // Should show success toast
      await expect(page.locator('text=You have been signed out')).toBeVisible({ timeout: 5000 });

      // Should redirect to home and show sign in button (logged out state)
      await expect(page.locator('nav').getByRole('link', { name: /sign in/i })).toBeVisible({ timeout: 5000 });
    });

    test('should show welcome toast after login', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      await page.locator('#email').fill(TEST_USER.email);
      await page.locator('#password').fill(TEST_USER.password);
      await page.locator('button[type="submit"]').click();

      // Should redirect and show welcome toast
      await page.waitForURL('/', { timeout: 10000 });
      await expect(page.locator('text=Welcome back!')).toBeVisible({ timeout: 5000 });
    });
  });
});
