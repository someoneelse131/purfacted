/**
 * Test Helpers
 * 
 * Utility functions for writing tests.
 */

import type { RequestEvent } from '@sveltejs/kit';

/**
 * Create a mock RequestEvent for testing API endpoints
 */
export function createMockRequestEvent(options: {
  method?: string;
  url?: string;
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  locals?: Record<string, unknown>;
}): Partial<RequestEvent> {
  const {
    method = 'GET',
    url = 'http://localhost:3000',
    body,
    params = {},
    headers = {},
    locals = {},
  } = options;

  return {
    request: new Request(url, {
      method,
      headers: new Headers({
        'Content-Type': 'application/json',
        ...headers,
      }),
      body: body ? JSON.stringify(body) : undefined,
    }),
    params,
    locals: locals as App.Locals,
    url: new URL(url),
  };
}

/**
 * Assert that a response has the expected status code
 */
export function assertStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`
    );
  }
}

/**
 * Parse JSON response body
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Generate a random email for testing
 */
export function randomEmail(): string {
  const random = Math.random().toString(36).substring(7);
  return `test-${random}@example.com`;
}

/**
 * Generate a random string
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Wait for a specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a valid test password
 */
export function validPassword(): string {
  return 'TestPassword123!';
}

/**
 * Create an invalid test password (too short)
 */
export function invalidPassword(): string {
  return 'short';
}

/**
 * Mock trust score calculation inputs
 */
export const mockTrustActions = {
  factApproved: { action: 'fact_approved', expectedChange: 10 },
  factWrong: { action: 'fact_wrong', expectedChange: -20 },
  factOutdated: { action: 'fact_outdated', expectedChange: 0 },
  vetoSuccess: { action: 'veto_success', expectedChange: 5 },
  vetoFail: { action: 'veto_fail', expectedChange: -5 },
  verificationCorrect: { action: 'verification_correct', expectedChange: 3 },
  verificationWrong: { action: 'verification_wrong', expectedChange: -10 },
  upvoted: { action: 'upvoted', expectedChange: 1 },
  downvoted: { action: 'downvoted', expectedChange: -1 },
};

/**
 * Mock vote weight test cases
 */
export const mockVoteWeights = {
  anonymous: { userType: 'ANONYMOUS', baseWeight: 0.1 },
  verified: { userType: 'VERIFIED', baseWeight: 2 },
  expert: { userType: 'EXPERT', baseWeight: 5 },
  phd: { userType: 'PHD', baseWeight: 8 },
  organization: { userType: 'ORGANIZATION', baseWeight: 100 },
  moderator: { userType: 'MODERATOR', baseWeight: 3 },
};

/**
 * Mock trust modifiers
 */
export const mockTrustModifiers = [
  { trustScore: 150, expectedModifier: 1.5 },
  { trustScore: 100, expectedModifier: 1.5 },
  { trustScore: 75, expectedModifier: 1.2 },
  { trustScore: 50, expectedModifier: 1.2 },
  { trustScore: 25, expectedModifier: 1.0 },
  { trustScore: 0, expectedModifier: 1.0 },
  { trustScore: -10, expectedModifier: 0.5 },
  { trustScore: -25, expectedModifier: 0.5 },
  { trustScore: -30, expectedModifier: 0.25 },
  { trustScore: -50, expectedModifier: 0.25 },
  { trustScore: -60, expectedModifier: 0 },
  { trustScore: -100, expectedModifier: 0 },
];
