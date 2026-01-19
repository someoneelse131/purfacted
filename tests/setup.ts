/**
 * Test Setup File
 * 
 * This file runs before all tests to set up the test environment.
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://purfacted:test@localhost:5433/purfacted_test';

// Global setup before all tests
beforeAll(async () => {
  // Initialize test database connection
  // This will be implemented when Prisma is set up
  console.log('🧪 Test suite starting...');
});

// Global teardown after all tests
afterAll(async () => {
  // Close database connections
  console.log('🧪 Test suite complete.');
});

// Reset state before each test
beforeEach(async () => {
  // Reset any mocks
  // Clear test data if needed
});

// Cleanup after each test
afterEach(async () => {
  // Restore mocks
});

// Export helper for database reset (to be used in specific tests)
export async function resetTestDatabase() {
  // This will be implemented to truncate tables between tests
  // Placeholder for now
}

// Export helper for creating test users
export async function createTestUser(overrides = {}) {
  // This will be implemented to create test users
  // Placeholder for now
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    userType: 'VERIFIED',
    trustScore: 10,
    ...overrides,
  };
}

// Export helper for creating test facts
export async function createTestFact(overrides = {}) {
  // This will be implemented to create test facts
  // Placeholder for now
  return {
    id: 'test-fact-id',
    title: 'Test Fact',
    body: 'This is a test fact.',
    status: 'SUBMITTED',
    ...overrides,
  };
}
