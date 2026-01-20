/**
 * Test Setup File
 *
 * This file runs before all tests to set up the test environment.
 * It configures global hooks, mocks, and test utilities.
 */

import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { resetIdCounter } from './helpers';

// ============================================
// Environment Setup
// ============================================

// Set test environment variables
process.env.NODE_ENV = 'test';
// Inside Docker, postgres is the hostname; outside use localhost
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://purfacted:purfacted@postgres:5432/purfacted';

// Default test configuration overrides
process.env.TRUST_NEW_USER_START = '10';
process.env.RATE_LIMIT_ANONYMOUS_VOTES_PER_DAY = '5';
process.env.FEATURE_ANONYMOUS_VOTING = 'true';
process.env.FEATURE_LLM_GRAMMAR_CHECK = 'false'; // Disable by default in tests

// ============================================
// Global Test Hooks
// ============================================

// Global setup before all tests
beforeAll(async () => {
	console.log('🧪 Test suite starting...');
});

// Global teardown after all tests
afterAll(async () => {
	console.log('🧪 Test suite complete.');
});

// Reset state before each test
beforeEach(async () => {
	// Reset ID counter for consistent test data
	resetIdCounter();

	// Clear all mocks
	vi.clearAllMocks();
});

// Cleanup after each test
afterEach(async () => {
	// Restore mocks
	vi.restoreAllMocks();
});

// ============================================
// Global Mock Configuration
// ============================================

// Mock console.error to reduce noise in tests (but keep track of calls)
const originalConsoleError = console.error;
const consoleErrorCalls: unknown[][] = [];

vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
	consoleErrorCalls.push(args);
	// Uncomment to see errors during debugging:
	// originalConsoleError(...args);
});

vi.spyOn(console, 'warn').mockImplementation(() => {
	// Suppress warnings in tests
});

// ============================================
// Export Helper Functions
// ============================================

/**
 * Get all console.error calls made during tests
 */
export function getConsoleErrorCalls(): unknown[][] {
	return [...consoleErrorCalls];
}

/**
 * Clear console.error call history
 */
export function clearConsoleErrorCalls(): void {
	consoleErrorCalls.length = 0;
}

/**
 * Restore original console.error for debugging
 */
export function restoreConsoleError(): void {
	console.error = originalConsoleError;
}

// ============================================
// Re-export Helpers
// ============================================

export * from './helpers';
