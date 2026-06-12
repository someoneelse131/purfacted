# PurFacted 2.0 - Requirements Catalog

> **This is a full rewrite.** The previous implementation (R1-R50, tagged `v1` in git)
> serves as reference only. Code is rebuilt clean; the concept below supersedes all
> earlier requirements. Obsolete v1 docs (TEST-REQUIREMENTS.md, TEST-PROGRESS.md)
> have already been removed.

---

# Part A: Concept

## Vision

PurFacted is a community platform for fact verification. Claims are proven or refuted
through **community-evaluated evidence**, not through opinion voting. The review work
itself (finding sources, rating them, discussing) is the core community activity.

**Domain:** purfacted.com
**Language:** English (international audience; i18n possible later)
**Stack:** SvelteKit + TypeScript, PostgreSQL, Redis, Prisma, Tailwind, Vitest + Playwright, Docker

## Roles & Vote Weights

| Role         | Vote weight                              | Notes                                                        |
| ------------ | ---------------------------------------- | ------------------------------------------------------------ |
| Anonymous    | 0 (read-only)                            | No account needed to browse                                  |
| Verified     | 1.0                                      | Email-verified account                                       |
| Expert       | 3.0 **only in their field's categories** | 1.0 elsewhere. Credential upload, reviewed by moderators     |
| Moderator    | 1.0                                      | Moderation is a function, not a vote bonus                   |
| Organization | 0 votes                                  | "Official Statement" channel instead; verified by moderators |

**Final weight = base weight x reputation modifier**, where
`modifier = clamp(1 + reputation / 200, 0.5, 1.5)`.
Total spread is therefore at most ~1:9 (0.5 vs 4.5).

## Reputation

Earned through verification work. Comments never affect reputation (prevents farming).

| Action                                                | Points |
| ----------------------------------------------------- | ------ |
| Your fact reaches VERIFIED                            | +10    |
| Your fact reaches REFUTED                             | -15    |
| Your veto succeeds                                    | +5     |
| Your veto fails                                       | -5     |
| Source you added reaches positive consensus           | +2     |
| Source you added is removed as misleading/spam        | -3     |
| Your source vote matches the source's final consensus | +1     |

All values configurable (database-backed config, see R9/R38).

## Fact Lifecycle (Review-first + Evidence)

```
Submit (claim + min. 1 starting source)
   v
[UNDER_REVIEW]  <- lives in the "Review Hub"
   |  community attaches PRO / CONTRA evidence (sources)
   |  each source is voted on individually (weighted)
   |  threaded comments alongside
   v  quorum reached (see below)
[VERIFIED]   [DISPUTED]   [REFUTED]
   v
Main feed with status badge
   v
[Veto with new evidence] -> back to UNDER_REVIEW
```

- No quorum after the review window expires -> status **UNSUBSTANTIATED**
  (stays findable in the Review Hub, can be revived by new evidence).
- The status is computed from the **evidence balance**, never from direct
  up/down votes on the fact itself.

### Evidence scoring

- Each source has a credibility value by type:
  PEER_REVIEWED 5, OFFICIAL 4, NEWS 3, COMPANY 2, BLOG 1, OTHER 1 (configurable).
- Reviewers vote per source: "credible and supports its side" (up/down, weighted).
- `sourceScore = max(0, sum of weighted votes) * credibility`
  (a junk source scores 0 for its side, never negative).
- `proScore = sum of PRO sourceScores`, `contraScore = sum of CONTRA sourceScores`.
- `balance = (proScore - contraScore) / (proScore + contraScore)` (range -1..+1).

### Status thresholds (configurable defaults)

| Condition       | Status   |
| --------------- | -------- |
| balance >= +0.5 | VERIFIED |
| balance <= -0.5 | REFUTED  |
| otherwise       | DISPUTED |

### Quorum (configurable defaults)

- Total vote weight across all sources >= 15
- Distinct reviewers >= 5
- Review open >= 48 h
- Review window: 14 days, then UNSUBSTANTIATED if no quorum

## Interaction Formats

1. **Evidence section** per fact: PRO column / CONTRA column of sources, each
   individually voted. Replaces v1's PRO/CONTRA discussion posts.
2. **One threaded comment section** per fact (max depth 4, weighted comment votes
   for sorting only - no reputation effect).
3. **Veto**: formal objection against a finished fact. Requires at least one NEW
   source. Sends the fact back to UNDER_REVIEW. Success/failure affects reputation.
4. **Public structured debates**: two users debate a fact in fixed turns
   (Opening -> Rebuttal -> Closing, char-limited), public from the start, community
   votes for the more convincing side afterwards. Private debates from v1 are dropped.

## Community Features

- **Gamification**: badges (e.g. "Source Hunter", "First Verdict"), levels derived
  from reputation, leaderboards (week / month / all-time).
- **Follow & feeds**: follow categories and users; personalized home feed plus
  global feed; weekly digest email.
- **Hotspots**: "Needs your review" section - facts close to quorum, fresh vetoes,
  unrated sources.
- **Embeds & sharing**: embeddable fact cards with live status, OG images for links.
- **Notifications**: in-app (SSE) + email, batched, one-click unsubscribe.

## Categories

Curated tree, managed by moderators. Users can propose new categories (moderation
queue). No user-created categories or merge-voting (v1 mechanism dropped).
Expert status is bound to one or more categories.

## Moderation & Abuse (slimmed down)

- One moderation queue handling: content reports, expert/org verification,
  escalated vetoes, flagged accounts, category proposals.
- Progressive bans: 3 days -> 30 days -> permanent (email + IP blocked).
- Bot protection: captcha on registration, honeypot fields, per-endpoint rate
  limits, disposable-email blocking.
- Moderators are appointed by admins. v1's auto-election (phases, slots,
  inactivity handling) is dropped as over-engineering.

## Quality Principle ("it actually works")

A requirement is DONE only when:

1. Unit tests for the business logic pass.
2. A Playwright E2E test walks the user flow in a real browser.
3. `npm run test` and `npm run test:e2e` are green.
4. Committed with message `[R<n>] <description>`.

**Each phase ends with a deployment to the dev server (port 3000) and manual
acceptance on purfacted.com before the next phase starts.**

---

# Part B: Requirements

## Phase 1: Core (R1-R20) - goal: live on purfacted.com

### [R1] Clean Project Scaffold

Re-initialize the codebase for v2.

**Tasks:**

- Tag/archive v1 (git tag `v1` exists), then remove v1 source and old tests
  from the working tree (obsolete docs already removed)
- Fresh SvelteKit + TypeScript project, Tailwind, ESLint/Prettier
- Prisma + PostgreSQL, Redis client
- docker-compose.yml (dev) and docker-compose.prod.yml (app exposed on
  APP_PORT, DB/Redis internal only)
- .env.example with every config value
- Layered structure: routes -> `src/lib/server/services/*` -> db; business logic
  only in services
- Vitest + Playwright wired up, CI-able via npm scripts
- Update CLAUDE.md project file to v2 (structure, commands)

**Test:** containers start, app boots, healthcheck `/api/health` returns 200,
example unit + E2E test pass.

---

### [R2] Database Schema - Core

Prisma schema for the core domain.

**Tables:**

- users (id, email, username, passwordHash, role, reputation, emailVerifiedAt,
  createdAt, lastLoginAt, banLevel, bannedUntil, deletedAt)
- sessions (custom session auth, Lucia-style: id, userId, expiresAt)
- email_verifications, password_resets (token, userId, expiresAt)
- categories (id, name, slug, parentId, status)
- facts (id, title, body, status, authorId, categoryId, reviewStartedAt,
  reviewDeadline, decidedAt, createdAt, updatedAt)
- sources (id, factId, side PRO|CONTRA, url, title, type, credibility,
  addedById, status, createdAt)
- source_votes (id, sourceId, userId, value, weight, createdAt)
- comments (id, factId, parentId, authorId, body, createdAt, editedAt, deletedAt)
- comment_votes (id, commentId, userId, value, weight)
- vetoes (id, factId, submitterId, reason, status, createdAt, resolvedAt)
- config (key, value, description) - all tunable values

**Enums:** Role (VERIFIED, EXPERT, MODERATOR, ORGANIZATION, ADMIN),
FactStatus (UNDER_REVIEW, VERIFIED, DISPUTED, REFUTED, UNSUBSTANTIATED),
SourceType (PEER_REVIEWED, OFFICIAL, NEWS, COMPANY, BLOG, OTHER)

**Test:** migrations run, seed config values load, CRUD on every table.

---

### [R3] Registration & Email Verification

- Username, email, password (min 10 chars, zxcvbn score >= 3 or equivalent)
- Captcha + honeypot on the form
- Disposable email domains blocked (local blocklist + optional API)
- Verification email with token, 24 h expiry; unverified accounts cannot vote/post
- New users start with reputation 0

**Test (unit + E2E):** register -> receive token -> verify -> account active.

---

### [R4] Login & Sessions

- Email or username + password
- Custom session management (DB-backed sessions, httpOnly cookie, sliding
  expiry 7 days, "remember me" 30 days)
- Rate limit: 5 failed attempts / 15 min per account and per IP
- Logout, "log out everywhere"

**Test (unit + E2E):** login, session persists across reload, logout works,
rate limit triggers.

---

### [R5] Password Self-Service

- Forgot-password mail with 1 h token, max 3 requests/h
- Change password while logged in (requires current password)
- All sessions invalidated on password change

**Test (unit + E2E):** full reset flow, change flow, session invalidation.

---

### [R6] Email Service

- SMTP config via .env (host, port, user, password, from, encryption)
- Redis-backed queue with retry
- Base layout + templates: verification, password reset, generic notification
- Every email has one-click unsubscribe (signed token)

**Test:** mails render correctly, queue retries on failure (mocked SMTP).

---

### [R7] User Profile & Settings

- Own profile: username, bio, avatar (optional), email change (re-verification)
- Settings: notification toggles, privacy (hide stats), account deletion (soft)
- Public profile page: username, role badge, level, reputation, join date,
  recent public activity (respecting privacy settings)

**Test (unit + E2E):** edit profile, change settings, public view respects privacy.

---

### [R8] Category System

- Curated tree (max depth 2), seeded with ~15 sensible top categories
- Moderators create/rename/move/disable categories
- Users propose categories -> moderation queue
- Category pages: facts filtered by category + subcategories

**Test (unit + E2E):** browse tree, propose category, moderator approves.

---

### [R9] Vote Weight & Config Engine

- Config service reading `config` table with Redis cache + invalidation
- `getVoteWeight(user, category)`: base by role, expert bonus only in expert's
  categories, reputation modifier `clamp(1 + rep/200, 0.5, 1.5)`
- All numbers from config, nothing hardcoded

**Test (unit):** every role/category/reputation combination from the concept table.

---

### [R10] Fact Submission

- Claim: title (max 200), body (max 3000), category, at least 1 starting source
- Source fields: URL (validated), title, type (auto-suggested by domain,
  user-correctable)
- Rate limit: max 5 facts/day per user (configurable)
- New fact -> status UNDER_REVIEW, reviewDeadline = now + 14 days
- Author cannot vote on sources of their own fact

**Test (unit + E2E):** submit fact with source, appears in Review Hub.

---

### [R11] Evidence System

- Any verified user adds PRO or CONTRA sources to facts UNDER_REVIEW
- Duplicate URL on the same fact is rejected (points to existing source)
- Source voting: up/down per user per source, weight snapshotted at vote time
- Sources flaggable as spam/misleading -> moderation; removed sources count -3
  reputation for the adder
- Evidence section UI: PRO/CONTRA columns, per-source score visible

**Test (unit + E2E):** add sources, vote, duplicate rejected, scores correct.

---

### [R12] Scoring & Status Engine

- Implements sourceScore / proScore / contraScore / balance exactly as in Part A
- Quorum check (weight >= 15, reviewers >= 5, age >= 48 h) - configurable
- Status transition on quorum: VERIFIED / DISPUTED / REFUTED, decidedAt set
- Scheduled job (node-cron or similar): expire reviews past deadline ->
  UNSUBSTANTIATED
- Reputation payouts on decision (author, source adders, voters per Part A)

**Test (unit):** scoring math table-driven; quorum edge cases; expiry job.
**Test (E2E):** fact reaches quorum and flips status.

---

### [R13] Review Hub

- Dedicated zone listing facts UNDER_REVIEW
- Filters: category, age, "close to quorum", newest
- Shows per fact: current balance (without revealing final verdict styling),
  missing quorum requirements ("needs 3 more reviewers")
- UNSUBSTANTIATED facts findable under their own tab, revivable by adding evidence
  (re-opens review window once)

**Test (E2E):** hub lists facts, filters work, revive flow.

---

### [R14] Main Feed, Fact Page & Search

- Main feed: only decided facts (VERIFIED/DISPUTED/REFUTED) with status badges,
  sort: newest / most reviewed / controversial
- Fact detail page: claim, status, evidence columns, comments, veto button,
  author with role badge
- Full-text search (Postgres tsvector) over title+body, filter by status/category
- Pagination everywhere, SSR, OG meta tags per fact

**Test (unit + E2E):** search finds fact, feed shows only decided facts, detail
page renders all sections.

---

### [R15] Comments

- Threaded (max depth 4), max 2000 chars, edit window 15 min, soft delete
- Weighted up/down votes, used for sorting only
- Rate limit: configurable comments/hour

**Test (unit + E2E):** comment, reply, vote, sort order, depth limit.

---

### [R16] Veto System

- Any verified user can veto a decided fact; requires >= 1 NEW source (URL not
  yet on the fact) + reason text
- Fact returns to UNDER_REVIEW (veto badge shown), previous status stored
- After re-decision: veto succeeded if status changed -> +5 submitter, else -5
- Max 1 open veto per fact; rate limit per user

**Test (unit + E2E):** veto flow both outcomes, reputation applied.

---

### [R17] Reporting & Moderation Queue

- Report button on facts, sources, comments, profiles (reason dropdown + text)
- One moderation queue with type filters (reports, category proposals - more
  types join in later phases)
- Moderators: claim item, resolve (approve/remove content/dismiss), reporter
  gets notified of outcome
- Action log (who did what when)

**Test (unit + E2E):** report -> queue -> resolve -> notification.

---

### [R18] Ban System

- Progressive: level 1 = 3 days, level 2 = 30 days, level 3 = permanent
  (email + IP blocked) - durations configurable
- Banned users: read-only, banner with reason and expiry
- Moderators ban via queue/profiles; admins can lift bans
- Registration blocked for banned emails/IPs

**Test (unit + E2E):** escalation, blocked actions, re-registration rejected.

---

### [R19] Bot Prevention

- Captcha: registration (always), other actions behind suspicion heuristics
- Honeypot fields on all public forms
- Central rate-limit middleware (Redis), per-endpoint configs
- Disposable email blocklist

**Test (unit):** rate limiter, honeypot rejection, blocklist.

---

### [R20] Phase-1 Deployment

- Seed: admin + moderator + demo users, 15 categories, ~20 facts in mixed states
- Production build, prod compose verified locally
- Deploy to dev server `/opt/purfacted` (app on :3000), DB migrated, seeded
- purfacted.com serves the app through the existing nginx proxy
- Smoke test checklist executed manually on production

**Test:** E2E suite against local prod build; manual acceptance on purfacted.com.

> **GATE: user acceptance on purfacted.com before Phase 2.**

---

## Phase 2: Community (R21-R30)

### [R21] Reputation Engine

- Implements every reputation rule from Part A as a single service with an
  append-only reputation_events table (auditable history)
- Recalculation idempotent; events deduplicated per (user, action, subject)

**Test (unit):** every rule, idempotency, history sums match user.reputation.

---

### [R22] Levels & Badges

- Levels from reputation thresholds (configurable, e.g. 0/50/150/400/1000)
- Badge engine: rule-based awards, e.g. "First Verdict" (first source vote),
  "Source Hunter" (25 sources with positive consensus), "Veto Verified"
  (first successful veto), "Streak" (review activity 7 days in a row)
- Badges + level on profile and next to usernames

**Test (unit + E2E):** thresholds, badge awards trigger exactly once.

---

### [R23] Leaderboards

- Week / month / all-time by reputation gained in window
- Per-category leaderboards
- Cached in Redis, refreshed periodically

**Test (unit + E2E):** correct ranking windows, cache refresh.

---

### [R24] Follow System

- Follow users and categories; follower counts on profiles
- Manage follows in settings

**Test (unit + E2E):** follow/unfollow, lists correct.

---

### [R25] Home Feed

- Personalized feed: activity from followed categories/users (new facts,
  status changes, debates) - falls back to global feed when empty
- Global feed remains available as a tab

**Test (unit + E2E):** personalization reflects follows.

---

### [R26] Hotspots ("Needs your review")

- Section on home + Review Hub: facts close to quorum, fresh vetoes,
  sources with < N votes
- Ranked by urgency (deadline proximity x missing quorum)

**Test (unit):** ranking logic. **(E2E):** section renders and links work.

---

### [R27] In-App Notifications

- SSE-based live notifications, bell with unread count
- Events: your fact decided, veto on your fact, reply to your comment, badge
  earned, debate challenge, moderation outcome
- Mark read (single/all), link to subject

**Test (unit + E2E):** event -> notification appears live -> mark read.

---

### [R28] Email Notifications

- Per-type toggles (default ON), batching (max 1 mail / N hours, aggregated)
- Reuses R6 queue + unsubscribe

**Test (unit):** batching, preferences respected.

---

### [R29] Expert Verification

- Apply with credential upload (PDF/image, stored outside web root) + chosen
  categories + field description
- Moderation queue type EXPERT_VERIFICATION; moderator approves/rejects with note
- Approved: role EXPERT, 3x weight in chosen categories, badge "Expert: <field>"
- Re-verification possible; admins can revoke

**Test (unit + E2E):** apply -> review -> expert weight active only in field.

---

### [R30] Phase-2 Deployment

- Deploy, migrate, smoke test on purfacted.com

> **GATE: user acceptance before Phase 3.**

---

## Phase 3: Reach (R31-R38)

### [R31] Structured Debates

- Any verified user challenges another user on a specific fact (e.g. from a
  comment); challenged user accepts/declines within 7 days
- Fixed turns, public from the start: Opening (max 1500) -> Rebuttal (max 1500)
  -> Closing (max 1000), each side, alternating, 72 h per turn (auto-forfeit)
- Debate page linked from the fact

**Test (unit + E2E):** full debate lifecycle including decline and timeout.

---

### [R32] Debate Voting & Outcome

- After closing: 7-day community vote "more convincing side" (weighted)
- Winner +5 reputation, loser 0 (participation should stay attractive)
- Result displayed permanently on debate + fact page

**Test (unit + E2E):** voting window, outcome, reputation.

---

### [R33] Organization Accounts

- Registration with domain-verified email + moderator approval (queue type)
- Can post **Official Statements** on facts (highlighted box, no vote weight)
- Can be tagged/mentioned on facts -> notified
- Cannot vote; cannot delete facts about them

**Test (unit + E2E):** org onboarding, official statement, tagging.

---

### [R34] Embeds & OG Images

- `/embed/fact/<id>` - iframe-safe fact card with live status
- Dynamically generated OG image per fact (status, title, score)
- Copy-embed-code button on fact page

**Test (E2E):** embed renders standalone, OG tags valid.

---

### [R35] Weekly Digest

- Opt-in (default on for new users): weekly mail with followed-category
  highlights, hotspot teaser, own stats
- Built on R6/R28 infrastructure

**Test (unit):** digest content assembly, opt-out respected.

---

### [R36] Public Read API

- `/api/v1/facts`, `/api/v1/facts/:id`, `/api/v1/categories`, `/api/v1/stats`
- API keys (per user), rate limits per tier (FREE 100/day default)
- OpenAPI spec served at `/api/openapi.json`

**Test (integration):** auth, rate limit, response shapes.

---

### [R37] LLM Writing Assist (optional feature flag)

- "Improve wording" button on fact submission: Claude API suggests clearer
  claim phrasing (grammar/structure only, never meaning)
- Graceful fallback when API unavailable; key/model via .env

**Test (unit):** mocked API, fallback path.

---

### [R38] Phase-3 Deployment

- Deploy, migrate, smoke test on purfacted.com

> **GATE: user acceptance before Phase 4.**

---

## Phase 4: Operations (R39-R44)

### [R39] Admin Panel

- Edit all config values (weights, thresholds, quorum, rate limits, ban
  durations) with validation + audit log
- User management: change role, adjust reputation (logged), lift bans
- Feature flags (debates, embeds, API, LLM assist)

**Test (unit + E2E):** config change takes effect without redeploy.

---

### [R40] Statistics Page

- Public: total users/facts/sources/votes, facts by status, category
  popularity, activity over time, top contributors
- Cached, no PII

**Test (unit + E2E):** numbers match seeded fixtures.

---

### [R41] Monitoring & Health

- `/api/health` (app, DB, Redis) - already from R1, extended with queue depth
- Structured request logging, error tracking hook
- Uptime Kuma monitor on mon server pointed at purfacted.com (manual step,
  documented)

**Test (unit):** health endpoint degrades correctly when Redis/DB down.

---

### [R42] Backups

- pg_dump cron on dev server + retention (documented script in repo,
  `scripts/backup.sh`)
- Restore procedure documented and tested once

**Test:** backup script produces restorable dump (verified in CI/dev).

---

### [R43] Security Pass

- Dependency audit, security headers (CSP, HSTS via nginx), cookie flags,
  CSRF posture documented, rate limits reviewed
- Run a structured security review over auth, voting and upload code paths

**Test:** automated checks green; findings fixed or documented.

---

### [R44] Final Polish & Docs

- README v2 (setup, deployment, architecture)
- Responsive check (mobile/tablet/desktop) on all core pages
- Empty states, loading skeletons, friendly error pages
- PROGRESS.md final pass

**Test (E2E):** core flows on mobile viewport.

---

## Dependencies

- R2 requires R1; R3-R7 require R2; R9 requires R2
- R10-R16 require R8, R9; R17-R19 require R3
- R20 requires R1-R19 (phase gate)
- R21 requires R12; R22-R23 require R21; R25-R26 require R24
- R27-R28 require R6; R29 requires R17
- R31-R32 require R27; R33 requires R17; R35 requires R28
- Phase gates: R20 -> R30 -> R38 -> R44

## Workflow Notes

- Work strictly in order R1, R2, R3, ...
- Definition of Done per requirement: unit tests + E2E test + suites green +
  commit `[R<n>] <description>` + PROGRESS.md updated
- Ask the user only when blocked; phase gates always require user acceptance
- All numeric values configurable via config table / .env - never hardcode
