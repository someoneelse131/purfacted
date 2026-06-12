# PurFacted 2.0 Implementation Progress

> v1 (R1-R50 + T1-T35) is complete and archived under git tag `v1`.
> This file tracks the **v2 rewrite** per REQUIREMENTS.md (PurFacted 2.0).

## Current Status

**Phase:** Phase 1: Core
**Next Requirement:** R20 - Phase-1 Deployment (GATE)

---

## Phase 1: Core (R1-R20) - goal: live on purfacted.com

- [x] R1 - Clean Project Scaffold
- [x] R2 - Database Schema - Core
- [x] R3 - Registration & Email Verification
- [x] R4 - Login & Sessions
- [x] R5 - Password Self-Service
- [x] R6 - Email Service
- [x] R7 - User Profile & Settings
- [x] R8 - Category System
- [x] R9 - Vote Weight & Config Engine
- [x] R10 - Fact Submission
- [x] R11 - Evidence System
- [x] R12 - Scoring & Status Engine
- [x] R13 - Review Hub
- [x] R14 - Main Feed, Fact Page & Search
- [x] R15 - Comments
- [x] R16 - Veto System
- [x] R17 - Reporting & Moderation Queue
- [x] R18 - Ban System
- [x] R19 - Bot Prevention
- [ ] R20 - Phase-1 Deployment (GATE: user acceptance)

## Phase 2: Community (R21-R30)

- [ ] R21 - Reputation Engine
- [ ] R22 - Levels & Badges
- [ ] R23 - Leaderboards
- [ ] R24 - Follow System
- [ ] R25 - Home Feed
- [ ] R26 - Hotspots ("Needs your review")
- [ ] R27 - In-App Notifications
- [ ] R28 - Email Notifications
- [ ] R29 - Expert Verification
- [ ] R30 - Phase-2 Deployment (GATE: user acceptance)

## Phase 3: Reach (R31-R38)

- [ ] R31 - Structured Debates
- [ ] R32 - Debate Voting & Outcome
- [ ] R33 - Organization Accounts
- [ ] R34 - Embeds & OG Images
- [ ] R35 - Weekly Digest
- [ ] R36 - Public Read API
- [ ] R37 - LLM Writing Assist
- [ ] R38 - Phase-3 Deployment (GATE: user acceptance)

## Phase 4: Operations (R39-R44)

- [ ] R39 - Admin Panel
- [ ] R40 - Statistics Page
- [ ] R41 - Monitoring & Health
- [ ] R42 - Backups
- [ ] R43 - Security Pass
- [ ] R44 - Final Polish & Docs

---

## Status Key

- `[ ]` Todo | `[x]` Done | `[~]` In Progress | `[!]` Blocked

## Completion Log

| Requirement | Completed  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1          | 2026-06-12 | Fresh scaffold: Svelte 5 / Kit 2.63 / Vite 8 / Tailwind 4 / Vitest 4 / Prisma 6, adapter-node, health service + `/api/health`, dev+prod compose (podman-compatible image names), prod image boot verified locally                                                                                                                                                                                                                                                                                                                                                                                           |
| R2          | 2026-06-12 | Core schema (11 tables, 7 enums), migration `init_core`, config seed (25 entries, idempotent, preserves tuned values), CRUD+cascade integration tests against `purfacted_test` (truncate-based reset - Prisma's `--force-reset` is consent-gated for AI agents)                                                                                                                                                                                                                                                                                                                                             |
| R3-R6       | 2026-06-12 | Auth block as one unit. R6: SMTP/dev-mailbox transport, Redis queue with backoff+dead letter, layout+3 templates, signed unsubscribe tokens, 5s worker in hooks. R3: register + zxcvbn(>=3, min 10) + honeypot + optional Turnstile + disposable blocklist, 24h verify token. R4: hashed-token DB sessions, sliding 7/30d expiry, 5 fails/15min per account+IP, logout (everywhere). R5: reset 1h token max 3/h, change password, full session invalidation. E2E: register->mailbox->verify->login->logout, reset flow, change flow, rate limit. zxcvbn-ts pinned to v3 (v4 CJS builds broken under vitest) |
| R7          | 2026-06-12 | Profile (bio/avatar-url), settings (hideStats, notifyEmail), email change with confirm-from-new-inbox flow (EmailVerification.newEmail), soft account deletion with password confirm, public profile with role badge, level (config thresholds), reputation, activity feed honoring hideStats                                                                                                                                                                                                                                                                                                               |
| R8          | 2026-06-12 | Curated tree max depth 2 (enforced on create+move), 15 seeded top categories (idempotent), moderator manage (create/rename/move/disable), user proposals -> approve/reject on /moderation (full queue lands in R17), category pages list facts incl. children, role guards in guards.ts                                                                                                                                                                                                                                                                                                                     |
| R9          | 2026-06-12 | getVoteWeight: role base weights from config, expert 3.0 only in own categories (parent covers children, ExpertCategory table), rep modifier clamp(1+rep/200, 0.5, 1.5), 0 for anonymous/unverified/banned/deleted/org. Config service cache+invalidation verified. Spec requires unit tests only (no user flow) - full concept table covered                                                                                                                                                                                                                                                               |
| R10-R11     | 2026-06-12 | Submit: validated claim+context+category+starting source, type auto-suggest by domain heuristics, credibility from config, 5/day rate limit, deadline now+14d. Evidence: PRO/CONTRA sources on UNDER_REVIEW facts, normalized duplicate-URL rejection, weighted votes with snapshot (change re-snapshots), author blocked from voting own fact, flag->Report (R17 queue), removeSourceAsMisleading -> REMOVED plus rep penalty. UI: /submit, /review (minimal hub), /facts/[id] with evidence columns+scores. Pure scoring math (sourceScore/balance/quorum/status) landed early for R12                    |
| R12         | 2026-06-12 | evaluateFact: quorum check (weight/reviewers/48h-age, configurable), atomic decision claim (updateMany guard -> payouts exactly once), statusForBalance thresholds, payouts (author +10/-15, adder +2 on positive consensus, voter +1 on matched consensus). runStatusTick (60s worker): expires past-deadline reviews -> UNSUBSTANTIATED, decides facts whose age gate opened. Votes trigger immediate evaluation. reopenReview for R13 revive/R16 veto. E2E: quorum flip via tuned config                                                                                                                 |
| R13         | 2026-06-12 | Review Hub: tabs (under review / unsubstantiated), filters (category incl. children, newest/oldest/close-to-quorum sort), per-fact neutral balance + missing-quorum line ("needs 3 more reviewers..."), revive-once flow (addSource on UNSUBSTANTIATED re-opens window, revivedAt guard)                                                                                                                                                                                                                                                                                                                    |
| R14         | 2026-06-12 | Main feed /facts (decided only) with newest/most-reviewed/controversial sorts, status+category filters, pagination; Postgres tsvector full-text search (generated column + GIN via raw-SQL migration, websearch_to_tsquery); OG meta tags on fact pages. Test DB now provisioned via migrate deploy (db push cannot express generated columns)                                                                                                                                                                                                                                                              |
| R15         | 2026-06-12 | Threaded comments (config: depth 4, 2000 chars, 15min edit window, 30/h rate limit), soft delete (own or moderator, shows [deleted]), weighted votes for sibling sorting only (reputation untouched), recursive CommentThread component with SSR forms on the fact page                                                                                                                                                                                                                                                                                                                                     |
| R16         | 2026-06-12 | Veto on decided facts: requires NEW source (normalized dup check; failed add restores the decided state), reason >=10 chars, max 1 open veto/fact, 3/day rate limit, previousStatus stored. Status engine resolves vetoes on re-decision and expiry: changed -> SUCCEEDED +5, same -> FAILED -5. Veto badge + form on fact page. reopenReview extracted to review-window.ts (cycle-free)                                                                                                                                                                                                                    |
| R17         | 2026-06-12 | Reports on facts/sources/comments/users (reason dropdown + detail, dedupe per reporter, 10/day limit), unified queue with tabs (reports + category proposals), claim (exclusive), resolve removed/dismissed (fact soft-delete via deletedAt filtered everywhere, comment soft-delete, source removal), append-only ModerationAction log, reporter email notification honoring notifyEmail + one-click unsubscribe route                                                                                                                                                                                     |
| R18         | 2026-06-12 | Progressive bans 3d/30d/permanent (config), banReason+lastLoginIp on user, permanent ban blocks email+last IP (BlockedIdentifier) and kills sessions, registration checks blocklist, banned users log in read-only (banner with reason/expiry; requireVerified guard + service checks block posting/voting), moderator ban via profile, admin lift (unblocks email), all logged                                                                                                                                                                                                                             |
| R19         | 2026-06-12 | Central per-IP middleware for anonymous POSTs in hooks (config ratelimit.anon_post_per_minute, 429 + retry-after, suspicion flag at half budget -> captcha on login when configured), honeypot on all public forms (register/submit/login/forgot-password) via shared helper, captcha always on registration (Turnstile, pass-through unconfigured), disposable blocklist from R3. Unit+integration tests for limiter/honeypot/blocklist                                                                                                                                                                    |

## Blockers & Questions

None yet.
