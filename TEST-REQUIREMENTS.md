# PurFacted Test Requirements

## Overview

Comprehensive test suite for the PurFacted fact verification platform. This document defines all test requirements organized by category.

---

## Phase T1: Fix Existing Test Issues (T1-T5)

### T1: Fix LLM Test Environment Issue
- [ ] Mock `isGrammarCheckAvailable` to return false in test env
- [ ] Ensure LLM tests don't require actual API key

### T2: Fix Mail Service Tests
- [ ] Mock nodemailer transporter properly
- [ ] Fix `sendVerificationEmail` test
- [ ] Fix `sendPasswordResetEmail` test
- [ ] Fix `sendNotificationEmail` test

### T3: Fix Anonymous Vote Test
- [ ] Mock captcha verification in test environment
- [ ] Ensure test bypasses captcha validation

### T4: Improve Test Setup
- [ ] Add proper database mocking utilities
- [ ] Add test factory functions for creating test data
- [ ] Add cleanup utilities between tests

### T5: Add Test Configuration
- [ ] Create separate test environment config
- [ ] Ensure all external services are mocked

---

## Phase T2: Missing Service Tests (T6-T9)

### T6: User Service Tests (`user.ts`)
- [ ] `registerUser` - valid input creates user
- [ ] `registerUser` - validation errors
- [ ] `registerUser` - disposable email rejection
- [ ] `registerUser` - duplicate email rejection
- [ ] `registerUser` - creates verification token
- [ ] `verifyEmail` - valid token verifies user
- [ ] `verifyEmail` - expired token returns null
- [ ] `verifyEmail` - invalid token returns null
- [ ] `getUserById` - returns user
- [ ] `getUserById` - returns null for missing user
- [ ] `getUserByEmail` - case insensitive lookup
- [ ] `updateLastLogin` - updates timestamp
- [ ] `isUserBanned` - returns false for unbanned user
- [ ] `isUserBanned` - returns true for temp banned user
- [ ] `isUserBanned` - returns true for permanent ban
- [ ] `isUserBanned` - returns false for expired ban

### T7: Auth Service Tests (`auth.ts`)
- [ ] `login` - valid credentials return session
- [ ] `login` - invalid email returns error
- [ ] `login` - invalid password returns error
- [ ] `login` - unverified email returns error
- [ ] `login` - banned user returns error
- [ ] `login` - rate limited returns error
- [ ] `login` - remember me creates longer session
- [ ] `login` - resets rate limit on success
- [ ] `logout` - invalidates session
- [ ] `validateSession` - valid session returns user
- [ ] `validateSession` - expired session returns null
- [ ] `getSessionCookieName` - returns correct name
- [ ] `createBlankSessionCookie` - returns blank cookie

### T8: Trust Service Tests (`trust.ts`)
- [ ] Trust score calculation for fact approval
- [ ] Trust score calculation for fact rejection
- [ ] Trust score calculation for veto success
- [ ] Trust score calculation for veto failure
- [ ] Trust score modification boundaries (min/max)
- [ ] Trust history tracking

### T9: Vote Service Tests (`vote.ts`)
- [ ] Vote weight calculation by user type
- [ ] Vote weight modification by trust score
- [ ] Vote aggregation for facts
- [ ] Vote change handling
- [ ] Vote removal handling

---

## Phase T3: API Endpoint Tests (T10-T25)

### T10: Auth API Tests
- [ ] POST `/api/auth/register` - success
- [ ] POST `/api/auth/register` - validation errors
- [ ] POST `/api/auth/register` - duplicate email
- [ ] POST `/api/auth/login` - success
- [ ] POST `/api/auth/login` - invalid credentials
- [ ] POST `/api/auth/logout` - success
- [ ] POST `/api/auth/verify` - valid token
- [ ] POST `/api/auth/verify` - invalid token
- [ ] POST `/api/auth/forgot-password` - sends email
- [ ] POST `/api/auth/reset-password` - changes password

### T11: User API Tests
- [ ] GET `/api/user/profile` - authenticated
- [ ] GET `/api/user/profile` - unauthenticated
- [ ] PATCH `/api/user/profile` - updates profile
- [ ] POST `/api/user/email` - changes email
- [ ] DELETE `/api/user/delete` - deletes account

### T12: Facts API Tests
- [ ] GET `/api/facts` - list facts
- [ ] GET `/api/facts` - search/filter
- [ ] GET `/api/facts` - pagination
- [ ] POST `/api/facts` - create fact (authenticated)
- [ ] POST `/api/facts` - create fact (unauthenticated)
- [ ] GET `/api/facts/[id]` - get single fact
- [ ] PATCH `/api/facts/[id]` - update fact
- [ ] DELETE `/api/facts/[id]` - delete fact
- [ ] POST `/api/facts/grammar-check` - LLM check

### T13: Fact Sources API Tests
- [ ] GET `/api/facts/[id]/sources` - list sources
- [ ] POST `/api/facts/[id]/sources` - add source
- [ ] GET `/api/sources` - source credibility lookup

### T14: Voting API Tests
- [ ] POST `/api/facts/[id]/vote` - authenticated vote
- [ ] POST `/api/facts/[id]/vote` - vote change
- [ ] DELETE `/api/facts/[id]/vote` - remove vote
- [ ] POST `/api/votes/anonymous` - anonymous vote
- [ ] POST `/api/votes/anonymous` - captcha validation
- [ ] POST `/api/votes/anonymous` - rate limiting

### T15: Edit & Veto API Tests
- [ ] POST `/api/facts/[id]/edit` - request edit
- [ ] POST `/api/facts/[id]/duplicate` - report duplicate
- [ ] POST `/api/facts/[id]/veto` - create veto
- [ ] GET `/api/vetos/[id]` - get veto
- [ ] POST `/api/vetos/[id]/vote` - vote on veto

### T16: Categories API Tests
- [ ] GET `/api/categories` - list categories
- [ ] POST `/api/categories` - create category
- [ ] GET `/api/categories/[id]` - get category
- [ ] PATCH `/api/categories/[id]` - update category
- [ ] POST `/api/categories/[id]/aliases` - add alias
- [ ] GET `/api/categories/tree` - get category tree
- [ ] GET `/api/categories/lookup` - lookup by name
- [ ] POST `/api/categories/merge-requests` - create merge
- [ ] POST `/api/categories/merge-requests/[id]/vote` - vote on merge

### T17: Discussions API Tests
- [ ] GET `/api/facts/[id]/discussions` - list discussions
- [ ] POST `/api/facts/[id]/discussions` - create discussion
- [ ] GET `/api/discussions/[id]` - get discussion
- [ ] PATCH `/api/discussions/[id]` - update discussion
- [ ] DELETE `/api/discussions/[id]` - delete discussion
- [ ] POST `/api/discussions/[id]/vote` - vote on discussion

### T18: Comments API Tests
- [ ] GET `/api/facts/[id]/comments` - list comments
- [ ] POST `/api/facts/[id]/comments` - create comment
- [ ] GET `/api/comments/[id]` - get comment
- [ ] PATCH `/api/comments/[id]` - update comment
- [ ] DELETE `/api/comments/[id]` - delete comment
- [ ] POST `/api/comments/[id]/vote` - vote on comment

### T19: Debates API Tests
- [ ] GET `/api/debates` - list debates
- [ ] POST `/api/debates` - create debate
- [ ] GET `/api/debates/[id]` - get debate
- [ ] POST `/api/debates/[id]/messages` - send message
- [ ] POST `/api/debates/[id]/publish` - publish debate
- [ ] POST `/api/debates/[id]/vote` - vote on debate

### T20: User Block & Report API Tests
- [ ] POST `/api/users/[id]/block` - block user
- [ ] DELETE `/api/users/[id]/block` - unblock user
- [ ] GET `/api/user/blocked` - list blocked users
- [ ] POST `/api/reports` - create report
- [ ] GET `/api/reports/[id]` - get report

### T21: Organizations API Tests
- [ ] POST `/api/facts/[id]/organizations` - tag organization
- [ ] GET `/api/organizations` - list organizations
- [ ] GET `/api/organizations/[id]` - get organization

### T22: Verification API Tests
- [ ] POST `/api/verifications` - request verification
- [ ] GET `/api/verifications/[id]` - get verification
- [ ] PATCH `/api/verifications/[id]` - update verification

### T23: Moderator API Tests
- [ ] GET `/api/moderators` - list moderators
- [ ] POST `/api/moderators` - promote moderator
- [ ] DELETE `/api/moderators/[id]` - demote moderator
- [ ] POST `/api/users/[id]/trust-vote` - trust vote

### T24: Ban & Flag API Tests
- [ ] POST `/api/bans` - create ban
- [ ] GET `/api/bans/[id]` - get ban
- [ ] POST `/api/flags` - create flag
- [ ] GET `/api/flags/[id]` - get flag

### T25: Notification & Moderation API Tests
- [ ] GET `/api/notifications` - list notifications
- [ ] PATCH `/api/notifications/[id]` - mark as read
- [ ] GET `/api/notifications/preferences` - get preferences
- [ ] PATCH `/api/notifications/preferences` - update preferences
- [ ] GET `/api/moderation/queue` - get queue
- [ ] POST `/api/moderation/queue/[id]` - claim item
- [ ] POST `/api/moderation/actions` - take action
- [ ] GET `/api/stats` - get statistics
- [ ] GET `/api/admin` - admin dashboard

---

## Phase T4: Integration Tests (T26-T30)

### T26: User Registration Flow
- [ ] Register -> Verify Email -> Login -> Access protected route
- [ ] Register with disposable email -> Reject
- [ ] Register duplicate -> Reject

### T27: Fact Lifecycle
- [ ] Create fact -> Add sources -> Submit
- [ ] Vote on fact -> Status changes
- [ ] Edit request -> Approval -> Update

### T28: Trust Score Flow
- [ ] Post fact -> Get votes -> Status resolved -> Trust updated
- [ ] Veto successful -> Trust increase
- [ ] Veto failed -> Trust decrease

### T29: Moderator Flow
- [ ] User gains trust -> Auto-promoted
- [ ] Moderator inactive -> Auto-demoted
- [ ] Process moderation queue

### T30: Notification Flow
- [ ] Action triggers notification
- [ ] Email notification sent (when enabled)
- [ ] In-app notification created

---

## Phase T5: Test Infrastructure (T31-T35)

### T31: Test Database Setup
- [ ] Create test database reset script
- [ ] Seed test data before each test suite
- [ ] Proper cleanup after tests

### T32: Test Factories
- [ ] `createTestUser()` factory
- [ ] `createTestFact()` factory
- [ ] `createTestSession()` factory
- [ ] `createTestCategory()` factory

### T33: Mock Services
- [ ] Mock Redis client
- [ ] Mock Prisma client
- [ ] Mock email service
- [ ] Mock LLM service

### T34: Test Utilities
- [ ] API test helper for authenticated requests
- [ ] Response assertion helpers
- [ ] Time mocking utilities

### T35: Test Coverage Configuration
- [ ] Configure coverage thresholds
- [ ] Generate coverage reports
- [ ] Add coverage badges

---

## Progress Tracking

| Phase | Tests | Status |
|-------|-------|--------|
| T1-T5 | Fix Existing | [ ] |
| T6-T9 | Missing Services | [ ] |
| T10-T25 | API Endpoints | [ ] |
| T26-T30 | Integration | [ ] |
| T31-T35 | Infrastructure | [ ] |

---

## Running Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- --filter "user"

# Run in watch mode
npm run test:watch
```
