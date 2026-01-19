# PurFacted Requirements Catalog

## Project Context

PurFacted is a community-driven fact verification platform. Users submit facts with sources, the community votes with weighted trust scores, experts verify credentials, and moderators maintain quality.

**Domain:** purfacted.com  
**Stack:** SvelteKit + PostgreSQL + Redis + Docker

---

## Phase 1: Foundation & Authentication (R1-R10)

### [R1] Project Setup & Docker Configuration

Initialize the project with Docker Compose setup.

**Tasks:**
- Create SvelteKit project with TypeScript
- Configure Tailwind CSS
- Setup docker-compose.yml (dev) with PostgreSQL, Redis, App
- Setup docker-compose.prod.yml (production optimized)
- Create .env.example with all configuration options
- App port configurable via APP_PORT env var
- Only app container exposed externally
- PostgreSQL and Redis internal only (with optional debug ports)

**Test:** Docker containers start successfully, app accessible on configured port.

---

### [R2] Database Schema & Prisma Setup

Setup Prisma with complete database schema.

**Tables:**
- users (id, email, firstName, lastName, passwordHash, emailVerified, userType, trustScore, createdAt, updatedAt, lastLoginAt, banLevel, bannedUntil)
- sessions (Lucia auth)
- email_verifications (token, userId, expiresAt)
- password_resets (token, userId, expiresAt)

**User Types Enum:** ANONYMOUS, VERIFIED, EXPERT, PHD, ORGANIZATION, MODERATOR

**Test:** Migrations run, can create/read users.

---

### [R3] Authentication - Registration

User registration with email verification.

**Requirements:**
- First name, last name, email, password required
- Password: min 8 chars, 1 number, 1 special char
- Block disposable email domains (API lookup)
- Send verification email with token
- Token expires in 24h (configurable)
- New users start with +10 trust score
- Captcha on registration form

**Test:** User can register, receives email, can verify.

---

### [R4] Authentication - Login & Sessions

Login system with session management.

**Requirements:**
- Email + password login
- Session duration: 7 days (configurable)
- "Remember me" extends to 30 days
- Track lastLoginAt
- Rate limit: 5 failed attempts per 15 minutes

**Test:** User can login, session persists, logout works.

---

### [R5] Authentication - Password Self-Service

Password reset and change functionality.

**Requirements:**
- Forgot password sends reset link
- Reset link expires in 1 hour (configurable)
- Max 3 reset requests per hour
- Change password when logged in (requires current password)
- Password validation same as registration

**Test:** Can request reset, use link, change password.

---

### [R6] Email Service Configuration

Configurable email sending.

**Requirements:**
- All mail config in .env (MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD, MAIL_FROM, MAIL_FROM_NAME, MAIL_ENCRYPTION)
- Email templates for: verification, password reset, notifications
- Every email includes unsubscribe link/instructions
- Queue emails via Redis for reliability

**Test:** Emails send successfully with correct content.

---

### [R7] User Profile & Settings

Basic user profile and settings page.

**Requirements:**
- View/edit profile (name, email)
- Email change requires re-verification
- Notification preferences (toggles for each type)
- Default: email notifications ON
- Account deletion option (soft delete)

**Test:** Can update profile, change notification settings.

---

### [R8] Trust Score System - Core

Implement trust score calculation.

**Requirements:**
- Store all point values in database (configurable)
- Calculate trust score from user actions
- Trust score affects vote weight modifier
- Functions: calculateTrustChange(action), getVoteModifier(trustScore)
- All values from .env/database, not hardcoded

**Point Values:**
- fact_approved: +10
- fact_wrong: -20
- fact_outdated: 0
- veto_success: +5
- veto_fail: -5
- verification_correct: +3
- verification_wrong: -10
- upvoted: +1
- downvoted: -1

**Test:** Trust calculations correct for all scenarios.

---

### [R9] Vote Weight System

Implement weighted voting based on user type and trust.

**Requirements:**
- Base weights by user type (configurable in DB):
  - Anonymous: 0.1
  - Verified: 2
  - Expert: 5
  - PhD: 8
  - Organization: 100
  - Moderator: 3
- Trust modifier applied to base weight
- Final weight = baseWeight * trustModifier

**Test:** Vote weights calculate correctly.

---

### [R10] Anonymous Voting

Allow anonymous users to vote with restrictions.

**Requirements:**
- No login required
- Captcha required for each vote
- 1 vote per day per IP address
- Vote weight: 0.1 (configurable)
- IP tracking for rate limiting

**Test:** Anonymous can vote once/day, blocked after limit.

---

## Phase 2: Fact System (R11-R20)

### [R11] Fact Database Schema

Extend schema for facts and sources.

**Tables:**
- facts (id, title, body, status, userId, categoryId, duplicateOfId, createdAt, updatedAt)
- sources (id, factId, url, title, type, credibility, addedByUserId, createdAt)
- fact_edits (id, factId, oldBody, newBody, userId, status, reviewedByUserId, createdAt)

**Fact Status Enum:** SUBMITTED, IN_REVIEW, PROVEN, DISPROVEN, CONTROVERSIAL, UNDER_VETO_REVIEW

**Source Type Enum:** PEER_REVIEWED, OFFICIAL, NEWS, COMPANY, BLOG, OTHER

**Test:** Can create facts with sources.

---

### [R12] Fact Creation

Create new facts with required source.

**Requirements:**
- Title (max 200 chars), body (max 5000 chars)
- Minimum 1 source required
- Source fields: URL, title, type (dropdown)
- Auto-suggest source type by domain (.gov → OFFICIAL, etc.)
- Max 5 facts per day for new users (configurable)
- Facts visible immediately (status: SUBMITTED)

**Test:** Can create fact with source, validation works.

---

### [R13] LLM Grammar Check

Grammar and structure checking before submit.

**Requirements:**
- "Check" button calls LLM API
- LLM suggests grammar/structure corrections
- User can approve, modify, or re-check
- API configurable (Anthropic Claude default)
- LLM_API_KEY, LLM_MODEL in .env
- Graceful fallback if API unavailable

**Test:** Grammar check returns suggestions, can approve.

---

### [R14] Source Credibility System

Source credibility affects fact score.

**Requirements:**
- Credibility points by type (configurable in DB):
  - Peer-reviewed: +5
  - Official: +4
  - News: +3
  - Company: +2
  - Blog: +1
- User selects type, system auto-suggests
- Moderators can correct miscategorized sources
- Users can add sources to existing facts (needs review)

**Test:** Source credibility calculated correctly.

---

### [R15] Fact Voting

Weighted voting on facts.

**Requirements:**
- Upvote/downvote (one per user per fact)
- Calculate weighted score
- Store individual votes with weight at time of vote
- Debounce rapid clicks
- Update fact status based on thresholds (configurable):
  - >75% positive → PROVEN
  - <25% positive → DISPROVEN
  - 25-75% → CONTROVERSIAL
  - Minimum votes required (default: 20)

**Test:** Voting works, status updates correctly.

---

### [R16] Fact Display & Search

View and search facts.

**Requirements:**
- List view with filters (category, status, date)
- Search by title/body
- Sort by: newest, most voted, controversial
- Pagination
- Fact detail page shows: title, body, sources, votes, discussions
- Show author with verification badge

**Test:** Search returns correct results, pagination works.

---

### [R17] Fact Editing

Edit facts (grammar/structure only).

**Requirements:**
- Only author can request edit
- Edit limited to grammar/structure, not meaning
- Creates edit request in moderation queue
- Shows diff to moderators
- Original preserved in fact_edits table

**Test:** Edit request created, moderator can review.

---

### [R18] Duplicate Detection & Merging

Handle duplicate facts.

**Requirements:**
- Any user can flag fact as duplicate
- Moderator approves/rejects duplicate claim
- Duplicate gets badge + reference to main fact
- Main fact shows "Duplicates" list
- Most voted fact becomes primary
- Votes/discussions transfer to primary

**Test:** Duplicate flagging and merging works.

---

### [R19] Veto System

Challenge established facts.

**Requirements:**
- Any user can submit veto with new evidence
- Veto requires source(s)
- Fact status → UNDER_VETO_REVIEW
- Community votes on veto
- If veto succeeds:
  - Fact status changes (disproven if wrong, stays if outdated)
  - Original author: -20 trust if wrong, 0 if outdated
  - Veto submitter: +5 trust
- If veto fails:
  - Veto submitter: -5 trust

**Test:** Veto flow works, trust scores update.

---

### [R20] Category System

User-created categories with merging.

**Tables:**
- categories (id, name, parentId, createdByUserId, createdAt)
- category_aliases (id, categoryId, alias)
- category_merge_requests (id, fromCategoryId, toCategoryId, votes, status)

**Requirements:**
- Users can create categories
- Users can vote to merge similar categories (cook → cooking)
- Most voted name becomes primary
- Aliases redirect to primary
- Subtag support (parent categories)

**Test:** Category creation, merging, aliases work.

---

## Phase 3: Discussions & Comments (R21-R30)

### [R21] Discussion Posts Schema

Schema for PRO/CONTRA/NEUTRAL discussions.

**Tables:**
- discussions (id, factId, userId, type, body, createdAt, updatedAt)
- discussion_votes (id, discussionId, userId, value, weight, createdAt)

**Discussion Type Enum:** PRO, CONTRA, NEUTRAL

**Test:** Can create discussions with types.

---

### [R22] Discussion Posts Feature

Create and vote on discussion posts.

**Requirements:**
- PRO (with evidence), CONTRA (with evidence), NEUTRAL
- Max 2000 chars per discussion
- Weighted voting (same as facts)
- Show discussions sorted: by type (PRO/CONTRA columns) and by votes

**Test:** Can create discussions, voting works.

---

### [R23] Comments Schema & Feature

Quick comments on facts.

**Tables:**
- comments (id, factId, userId, body, parentId, createdAt, updatedAt)
- comment_votes (id, commentId, userId, value, weight, createdAt)

**Requirements:**
- Max 2000 chars
- Threaded replies (parentId)
- Weighted voting
- Different from discussions (quick remarks vs structured arguments)

**Test:** Comments with replies and voting work.

---

### [R24] Debate System Schema

Private debates between users.

**Tables:**
- debates (id, factId, initiatorId, participantId, title, status, publishedAt, createdAt)
- debate_messages (id, debateId, userId, body, createdAt)

**Debate Status Enum:** PENDING, ACTIVE, PUBLISHED, DECLINED, EXPIRED

**Requirements:**
- Links to specific fact
- Has title (for publishing)
- History retained max 1 year (show notice in UI)

**Test:** Can create debate records.

---

### [R25] Debate Initiation & Messaging

Start and conduct debates.

**Requirements:**
- Only verified users can initiate
- Max messages per day to strangers (configurable, default: 10)
- Copy-paste detection → instant block (bot behavior)
- User can block another from messaging
- Private until published
- Show "Messages retained for 1 year" notice

**Test:** Can initiate debate, message limits work.

---

### [R26] Debate Publishing

Make debates public.

**Requirements:**
- Either user can request publish
- Other user must accept
- Published debate gets title
- Shows as scrollable popup on fact page
- Published debates can be voted (weighted)
- Doesn't affect fact score, just "Related Discussion"

**Test:** Publish flow works, voting on published debates.

---

### [R27] Debate Reporting & Moderation

Handle reported debates.

**Requirements:**
- Users can report debates
- Moderators can view reported private debates
- Action options: warn, block user, delete messages
- Unpublished debates private otherwise

**Test:** Reporting flow works, moderators can review.

---

### [R28] User-to-User Blocking

Block other users.

**Tables:**
- user_blocks (id, blockerId, blockedId, createdAt)

**Requirements:**
- Blocked user cannot: message, reply to comments, initiate debates
- Can still vote on facts (votes are somewhat anonymous)
- Block list in settings

**Test:** Blocking prevents interactions.

---

### [R29] Organization Comments

Special comments from organizations.

**Requirements:**
- Orgs auto-tagged by keyword in facts
- Users can manually tag orgs
- Tagged org gets notified
- Org can post "Official Comment" (instant publish, highlighted)
- Org can dispute fact → triggers review
- Org can add sources to facts about them
- Org cannot delete facts

**Test:** Org tagging and official comments work.

---

### [R30] Content Reporting

Report inappropriate content.

**Tables:**
- reports (id, reporterId, contentType, contentId, reason, status, reviewedByUserId, createdAt)

**Content Type Enum:** FACT, DISCUSSION, COMMENT, DEBATE, USER

**Requirements:**
- Report reason dropdown + optional details
- Creates entry in moderation queue
- Reporter notified of outcome

**Test:** Can report content, appears in queue.

---

## Phase 4: Users & Verification (R31-R40)

### [R31] Expert Verification Schema

Schema for diploma verification.

**Tables:**
- expert_verifications (id, userId, type, documentUrl, field, status, createdAt)
- verification_reviews (id, verificationId, reviewerId, approved, comment, createdAt)

**Verification Type Enum:** EXPERT, PHD

**Test:** Can create verification requests.

---

### [R32] Expert Verification Flow

Upload and verify diplomas.

**Requirements:**
- User uploads diploma image/PDF
- Selects type (Expert/PhD) and field
- Needs 3 approvals from other users (configurable)
- Shows who verified: "Verified by @user1, @user2, @user3"
- If approved: user type updated, trust +3 per reviewer
- If rejected: submitter trust -10
- Moderators can override

**Test:** Full verification flow works.

---

### [R33] Organization Accounts

Special organization accounts.

**Requirements:**
- Registration requires verified domain (.edu, company domain)
- Manual approval by moderator
- 100 vote points (configurable)
- Start with +50 trust score
- Become "owner" of facts they post
- Facts mentioning them: can comment, not delete

**Test:** Org registration and special privileges work.

---

### [R34] Moderator Auto-Election

Automatic moderator promotion.

**Requirements:**
- Bootstrap phase (0-100 users): manual appointment
- Early phase (100-500): manual + top 10% eligible
- Mature (500+): full auto (top 10% trusted)
- All thresholds configurable in DB
- Minimum trusted users before auto-election (default: 100)
- Auto-demoted if falls below threshold

**Test:** Auto-election triggers at thresholds.

---

### [R35] Inactive Moderator Handling

Handle inactive moderators.

**Requirements:**
- Inactive after 30 days no login (configurable)
- Status becomes "Trusted (Inactive)"
- Slot opens for next in line
- If they return: re-queue with priority if still top 10%
- Lowest trusted drops when inactive returns

**Test:** Inactive detection and slot management works.

---

### [R36] User Trust Voting

Users can vote on other users.

**Requirements:**
- Upvote/downvote other users
- Affects target's trust score (+1/-1)
- Limited: 10 user votes per day (configurable)
- Cannot vote same user twice in 30 days

**Test:** User voting with limits works.

---

### [R37] Ban System

Progressive ban system.

**Tables:**
- bans (id, userId, level, reason, bannedByUserId, expiresAt, createdAt)
- banned_emails (email)
- banned_ips (ip)

**Requirements:**
- First offense: blocked few days (configurable, default: 3)
- Second offense: blocked 1 month
- Third offense: permanent (email + IP blocked)
- Blocked actions: voting, posting, verifying
- New accounts from banned email/IP rejected

**Test:** Ban escalation works, blocked actions enforced.

---

### [R38] Negative Veto Account Flagging

Flag accounts with too many negative vetos.

**Requirements:**
- Track failed vetos per user
- Threshold configurable (default: 5 failed vetos)
- Account flagged for review
- User blocked from actions during review
- Not automatic ban, moderator decides

**Test:** Flagging triggers at threshold.

---

### [R39] Bot Prevention

Prevent bot abuse.

**Requirements:**
- Captcha for: registration, anonymous votes
- Honeypot fields on forms
- Rate limiting per endpoint (configurable)
- Email verification required within 24h
- Copy-paste message detection in debates
- Disposable email blocking (API lookup)

**Test:** Bot prevention measures work.

---

### [R40] User Profile Public View

Public user profiles.

**Requirements:**
- Shows: name, verification badge, trust score, join date
- Stats: facts posted, accuracy rate, expertise fields
- Recent activity (public posts only)
- Option to hide certain info in settings

**Test:** Profile displays correctly with privacy settings.

---

## Phase 5: Notifications & Moderation (R41-R50)

### [R41] Notification Schema

Schema for notifications.

**Tables:**
- notifications (id, userId, type, title, body, data, readAt, createdAt)
- notification_preferences (userId, type, email, inApp)

**Notification Types:** TRUST_LOST, TRUST_GAINED, FACT_REPLY, FACT_DISPUTED, VETO_RECEIVED, VERIFICATION_RESULT, ORG_COMMENT, DEBATE_REQUEST, DEBATE_PUBLISHED, MODERATOR_STATUS, FACT_STATUS

**Test:** Can create and query notifications.

---

### [R42] In-App Notifications

Real-time in-app notifications.

**Requirements:**
- WebSocket connection for real-time
- Notification bell with unread count
- Dropdown shows recent notifications
- Mark as read (individual or all)
- Link to relevant content

**Test:** Notifications appear in real-time.

---

### [R43] Email Notifications

Email notification system.

**Requirements:**
- Configurable per notification type
- Default: ON for all
- Easy unsubscribe (one-click link in email)
- Individual toggles in settings
- Batch notifications (don't spam, aggregate if many)
- Email templates for each type

**Test:** Emails sent for enabled notifications.

---

### [R44] Moderation Queue Schema

Schema for moderation.

**Tables:**
- moderation_queue (id, type, contentId, reason, status, assignedToUserId, createdAt, resolvedAt)

**Queue Type Enum:** REPORTED_CONTENT, EDIT_REQUEST, DUPLICATE_MERGE, VETO_REVIEW, ORG_APPROVAL, VERIFICATION_REVIEW, FLAGGED_ACCOUNT

**Test:** Can create queue items.

---

### [R45] Moderation Dashboard

Moderator interface.

**Requirements:**
- View pending items by type
- Filter by category, date, severity
- Claim items (assignedTo)
- Actions: approve, reject, warn, ban
- History of actions taken
- Moderator can mark self as wrong → others review

**Test:** Dashboard shows queue, actions work.

---

### [R46] Moderation Actions

Implement moderation actions.

**Requirements:**
- Approve: item passes, notify user
- Reject: item removed, notify user with reason
- Warn: user warned, logged
- Ban: triggers ban system
- Edit: moderator can edit content (logged)
- Override: for expert verifications

**Test:** All actions work and are logged.

---

### [R47] Statistics Page

Public platform statistics.

**Requirements:**
- Total users, facts, votes
- Facts by status (proven, disproven, etc.)
- Facts by category
- Top contributors (by trust score)
- Activity over time charts
- Category popularity
- Trust score distribution

**Test:** Stats calculate and display correctly.

---

### [R48] Admin Configuration Panel

Admin settings interface.

**Requirements:**
- Edit configurable values (trust points, weights, thresholds)
- View system health (queue size, response times)
- Manual user management (promote, demote, ban)
- Feature flags for enabling/disabling features
- Only accessible to admins (separate from moderators)

**Test:** Config changes apply correctly.

---

### [R49] Seed Data

Sample data for testing.

**Requirements:**
- Demo users: 1 each of verified, expert, phd, org, moderator
- 20 sample facts across categories
- Sample sources of different types
- Sample discussions, comments
- Sample categories with aliases
- Script: `npm run db:seed`

**Test:** Seed runs, data accessible.

---

### [R50] Final Polish & Documentation

Documentation and polish.

**Requirements:**
- README.md with setup instructions
- API documentation (endpoints, params, responses)
- Environment variables documented
- Docker deployment guide
- Responsive design check (mobile, tablet, desktop)
- Error handling and user-friendly messages
- Loading states and skeleton screens

**Test:** Documentation complete, responsive design works.

---

## Dependencies

Some requirements depend on others:

- R3-R7 require R2 (database)
- R8-R10 require R2
- R11-R20 require R8, R9
- R21-R30 require R11
- R31-R40 require R2, R8
- R41-R46 require R30, R31
- R47-R50 require most other requirements

Work in order (R1, R2, R3...) and dependencies will be satisfied.

---

## Notes

- All numeric values configurable via .env or database
- Write unit tests for each requirement
- Commit after each completed requirement
- Update PROGRESS.md as you go
- Ask user if blocked or unclear
