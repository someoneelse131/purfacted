# PurFacted 2.0 Implementation Progress

> v1 (R1-R50 + T1-T35) is complete and archived under git tag `v1`.
> This file tracks the **v2 rewrite** per REQUIREMENTS.md (PurFacted 2.0).

## Current Status

**Phase:** Phase 1: Core
**Next Requirement:** R3 - Registration & Email Verification

---

## Phase 1: Core (R1-R20) - goal: live on purfacted.com

- [x] R1 - Clean Project Scaffold
- [x] R2 - Database Schema - Core
- [ ] R3 - Registration & Email Verification
- [ ] R4 - Login & Sessions
- [ ] R5 - Password Self-Service
- [ ] R6 - Email Service
- [ ] R7 - User Profile & Settings
- [ ] R8 - Category System
- [ ] R9 - Vote Weight & Config Engine
- [ ] R10 - Fact Submission
- [ ] R11 - Evidence System
- [ ] R12 - Scoring & Status Engine
- [ ] R13 - Review Hub
- [ ] R14 - Main Feed, Fact Page & Search
- [ ] R15 - Comments
- [ ] R16 - Veto System
- [ ] R17 - Reporting & Moderation Queue
- [ ] R18 - Ban System
- [ ] R19 - Bot Prevention
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

| Requirement | Completed  | Notes                                                                                                                                                                                                                                                           |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1          | 2026-06-12 | Fresh scaffold: Svelte 5 / Kit 2.63 / Vite 8 / Tailwind 4 / Vitest 4 / Prisma 6, adapter-node, health service + `/api/health`, dev+prod compose (podman-compatible image names), prod image boot verified locally                                               |
| R2          | 2026-06-12 | Core schema (11 tables, 7 enums), migration `init_core`, config seed (25 entries, idempotent, preserves tuned values), CRUD+cascade integration tests against `purfacted_test` (truncate-based reset - Prisma's `--force-reset` is consent-gated for AI agents) |

## Blockers & Questions

None yet.
