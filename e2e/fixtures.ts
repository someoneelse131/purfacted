import { test as base, expect } from '@playwright/test';

// Test account credentials
export const TEST_USER = {
  email: 'admin@purfacted.com',
  password: 'Test123!@#',
  firstName: 'Admin',
  lastName: 'User'
};

// Extended test fixture with authentication helpers
export const test = base.extend<{
  authenticatedPage: ReturnType<typeof base.extend>;
}>({
  // Empty for now, can be extended with custom fixtures
});

export { expect };

// Helper to login - wait for hydration and use proper input methods
export async function login(page: any, email = TEST_USER.email, password = TEST_USER.password) {
  await page.goto('/auth/login');

  // Wait for the page to fully load and hydrate
  await page.waitForLoadState('load');

  // Wait for the email input to be ready and visible
  const emailInput = page.locator('#email');
  await emailInput.waitFor({ state: 'visible' });

  // Small delay to ensure Svelte hydration is complete
  await page.waitForTimeout(200);

  // Clear any existing value and fill email
  await emailInput.click();
  await emailInput.clear();
  await emailInput.fill(email);

  // Verify the email was filled correctly
  await expect(emailInput).toHaveValue(email);

  // Fill password
  const passwordInput = page.locator('#password');
  await passwordInput.click();
  await passwordInput.clear();
  await passwordInput.fill(password);

  // Verify password was filled
  await expect(passwordInput).toHaveValue(password);

  // Click submit button
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  // Wait for redirect to home page or wait for any navigation
  await page.waitForURL('/', { timeout: 15000 });
}

// Helper to logout
export async function logout(page: any) {
  await page.goto('/api/auth/logout');
  await page.waitForLoadState('load');
}

// Helper to check if logged in
export async function isLoggedIn(page: any): Promise<boolean> {
  await page.goto('/');
  await page.waitForLoadState('load');
  const logoutLink = await page.locator('text=Sign Out').count();
  const profileLink = await page.locator('text=Profile').count();
  return logoutLink > 0 || profileLink > 0;
}

// Generate unique email for registration tests
export function generateUniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}
