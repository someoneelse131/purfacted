# PurFacted 2.0 - Community Fact Verification Platform

## Project Overview

PurFacted is a community platform for fact verification. Claims are proven or
refuted through **community-evaluated evidence** (review-first + evidence model),
not through opinion voting on the claim itself.

**Domain:** purfacted.com
**Stack:** SvelteKit + PostgreSQL + Redis + Docker
**Priorities:** Lightweight, Performance, Security, Testability

> **This is the v2 rewrite.** The v1 implementation (50 requirements, complete)
> is archived under git tag `v1` and serves as reference only.
> **Single source of truth for the concept and all business rules:
> `REQUIREMENTS.md` (Part A = concept, Part B = requirements R1-R44).**

---

## Claude Code Configuration

### Mode: Autonomous (agentic, no loop tooling)

- Work autonomously through the open requirements in PROGRESS.md. The R-numbers
  in REQUIREMENTS.md Part B define the default dependency order, but related
  requirements may be implemented together as one coherent block when that is
  more efficient (e.g. R3-R5 auth, R10-R12 facts/evidence/scoring). Never start
  a requirement whose dependencies are not done.
- State lives in git history + PROGRESS.md - any new session resumes from there;
  no re-prompting loop tooling needed. Subagents/worktrees are fine for
  independent subtasks (research, parallel test writing, pre-commit review).
- Definition of Done per requirement (unchanged, non-negotiable):
  1. Unit tests for the business logic pass
  2. A Playwright E2E test covers the user flow
  3. `npm run test` and `npm run test:e2e` green
  4. Commit `[R<n>] <description>` (one commit may cover a block, e.g. `[R3-R5] ...`)
  5. PROGRESS.md updated
- Phase gates (R20, R30, R38): deploy to dev server, **stop and ask the user
  for acceptance on purfacted.com** before starting the next phase
- Ask user only when blocked

### Commands

```bash
npm run dev          # Development server (needs postgres+redis from compose)
npm run build        # Production build
npm run preview      # Serve the production build (port 4173)
npm run test         # Unit/component tests (Vitest; component tests need chromium via `npx playwright install chromium`)
npm run test:e2e     # E2E tests (Playwright; needs postgres+redis running)
npm run lint         # Prettier check + ESLint
npm run check        # svelte-check (types)
npm run db:push      # Push schema to database
npm run db:migrate   # Create/apply dev migration
npm run db:seed      # Seed data (prisma/seed.ts, exists from R2)
docker compose up    # Start all services (dev: postgres, redis, app)
```

Local note (laptop): Docker is not installed; use `podman-compose` (in
`~/.local/bin`) - the compose files are compatible (images are fully
qualified). Infra only: `podman-compose up -d postgres redis`.

### Progress Tracking

Check `PROGRESS.md`: `[ ]` Todo, `[x]` Done, `[~]` In Progress, `[!]` Blocked.

---

## Architecture

| Layer     | Technology                                                          | Purpose                                        |
| --------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| Frontend  | SvelteKit                                                           | SSR, routing, UI                               |
| Backend   | SvelteKit API routes                                                | REST endpoints                                 |
| Database  | PostgreSQL                                                          | Primary data store                             |
| Cache     | Redis                                                               | Sessions cache, queues, rate limits            |
| ORM       | Prisma                                                              | Database access                                |
| Auth      | Custom DB-backed sessions (Lucia-style, Lucia itself is deprecated) | Authentication                                 |
| Styling   | Tailwind CSS                                                        | Utility-first CSS                              |
| Testing   | Vitest + Playwright                                                 | Unit, integration, E2E                         |
| LLM       | Anthropic Claude API                                                | Optional writing assist (R37, feature-flagged) |
| Container | Docker Compose                                                      | Deployment                                     |

**Layering rule:** routes → `src/lib/server/services/*` → db.
Business logic lives only in services (testable in isolation). All numeric/business
values come from the `config` table or `.env` - never hardcoded.

Database schema: defined in R2 (see REQUIREMENTS.md). Core entities: users,
sessions, categories (curated tree), facts, sources (PRO/CONTRA evidence),
source_votes, comments, comment_votes, vetoes, config.

---

## Key Business Rules (summary - details in REQUIREMENTS.md Part A)

- **Fact lifecycle:** Submit → UNDER_REVIEW (Review Hub) → quorum →
  VERIFIED / DISPUTED / REFUTED → main feed; veto sends back to review;
  no quorum in 14 days → UNSUBSTANTIATED.
- **Status comes from the evidence balance** (weighted votes on individual
  PRO/CONTRA sources × source credibility), never from votes on the fact.
- **Vote weights:** Anonymous 0 (read-only), Verified 1.0, Expert 3.0 only in
  their categories, Moderator 1.0, Organization 0 (Official Statements instead).
  Final = base × reputation modifier `clamp(1 + rep/200, 0.5, 1.5)`.
- **Reputation:** earned via verification work (facts verified, sources with
  positive consensus, successful vetoes...). Comments never affect reputation.

---

## Testing Strategy

- Unit tests next to source files (`*.test.ts`)
- API/integration tests in `tests/`
- E2E tests in `e2e/` (Playwright), run against a real dev stack
- Separate test database, auto-reset before runs

---

## Deployment

- Target: dev server (`ssh dev`), `/opt/purfacted`, app on port **:3000**
- purfacted.com is proxied to dev:3000 by the central nginx server (already configured)
- Production: `docker compose -f docker-compose.prod.yml up -d` (only the app
  exposed; PostgreSQL/Redis internal)

---

## Starting Point

1. Read `REQUIREMENTS.md` (Part A concept, Part B requirements)
2. Check `PROGRESS.md` for the next open requirement
3. Work through requirements respecting dependencies and phase gates;
   group related requirements into blocks where sensible

**Start command:** "Read CLAUDE.md and start the workflow"
**Continue command:** "Continue from PROGRESS.md"
