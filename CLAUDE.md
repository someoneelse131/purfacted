# PurFacted - Community Fact Verification Platform

## Project Overview

PurFacted is a community-driven fact verification platform where users submit, verify, and discuss facts with weighted voting based on trust scores and expertise levels.

**Domain:** purfacted.com  
**Stack:** SvelteKit + PostgreSQL + Redis + Docker  
**Priorities:** Lightweight, Performance, Security, Testability

---

## Claude Code Configuration

### Mode: Ralph-Loop (Autonomous)

- Work through requirements systematically (R1, R2, R3...)
- Write unit tests for each feature
- Run tests before committing
- Commit after each completed requirement
- Update PROGRESS.md after each requirement
- Ask user only when blocked

### Commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm run test         # Run all tests
npm run test:watch   # Watch mode
npm run db:push      # Push schema to database
npm run db:seed      # Seed test data
docker-compose up    # Start all services
```

### Progress Tracking

Check `PROGRESS.md` for current status. Mark requirements as:
- `[ ]` Todo
- `[x]` Done  
- `[~]` In Progress
- `[!]` Blocked (needs user input)

---

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | SvelteKit | SSR, routing, UI |
| Backend | SvelteKit API | REST endpoints |
| Database | PostgreSQL | Primary data store |
| Cache | Redis | Sessions, caching |
| ORM | Prisma | Database access |
| Auth | Lucia Auth | Authentication |
| Styling | Tailwind CSS | Utility-first CSS |
| Testing | Vitest | Unit & integration tests |
| LLM | Anthropic Claude API | Grammar checking |
| Container | Docker Compose | Deployment |

### Project Structure

```
purfacted/
├── CLAUDE.md                 # This file
├── REQUIREMENTS.md           # All requirements
├── PROGRESS.md              # Progress tracking
├── docker-compose.yml       # Development
├── docker-compose.prod.yml  # Production
├── .env.example             # Environment template
├── package.json
├── svelte.config.js
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.js
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts              # Seed data
├── src/
│   ├── app.html
│   ├── app.css
│   ├── hooks.server.ts      # Auth hooks
│   ├── lib/
│   │   ├── server/
│   │   │   ├── db.ts        # Prisma client
│   │   │   ├── auth.ts      # Lucia setup
│   │   │   ├── redis.ts     # Redis client
│   │   │   ├── mail.ts      # Email service
│   │   │   ├── llm.ts       # Grammar check API
│   │   │   └── services/
│   │   │       ├── user.ts
│   │   │       ├── fact.ts
│   │   │       ├── vote.ts
│   │   │       ├── trust.ts
│   │   │       ├── moderation.ts
│   │   │       └── notification.ts
│   │   ├── utils/
│   │   │   ├── trustScore.ts
│   │   │   ├── voteWeight.ts
│   │   │   ├── validation.ts
│   │   │   └── *.test.ts    # Unit tests next to files
│   │   └── components/
│   │       ├── Fact.svelte
│   │       ├── Vote.svelte
│   │       ├── Comment.svelte
│   │       └── ...
│   └── routes/
│       ├── +layout.svelte
│       ├── +page.svelte
│       ├── auth/
│       │   ├── login/
│       │   ├── register/
│       │   ├── verify/
│       │   ├── forgot-password/
│       │   └── reset-password/
│       ├── facts/
│       │   ├── +page.svelte      # List/search
│       │   ├── new/
│       │   └── [id]/
│       ├── user/
│       │   ├── settings/
│       │   ├── profile/
│       │   └── [id]/
│       ├── moderation/
│       ├── debates/
│       ├── stats/
│       └── api/
│           ├── auth/
│           ├── facts/
│           ├── votes/
│           ├── users/
│           ├── comments/
│           ├── debates/
│           ├── moderation/
│           └── notifications/
└── tests/
    ├── setup.ts
    ├── helpers.ts
    └── api/
        └── *.test.ts
```

---

## Database Schema Overview

### Core Tables

- **users** - All user types (verified, expert, org, moderator)
- **sessions** - Auth sessions (Lucia)
- **facts** - Fact posts with sources
- **sources** - Linked sources with credibility
- **votes** - Weighted votes on facts/comments
- **comments** - Comments on facts
- **discussions** - PRO/CONTRA/NEUTRAL posts
- **debates** - Private/published user debates
- **debate_messages** - Messages in debates
- **categories** - User-created categories
- **category_aliases** - Merged category names
- **notifications** - User notifications
- **moderation_queue** - Items pending review
- **expert_verifications** - Diploma verification requests
- **user_blocks** - User blocking
- **bans** - Ban records

### Key Relationships

- User has many Facts, Votes, Comments
- Fact has many Sources, Votes, Comments, Discussions
- Fact belongs to Category
- Debate links two Users about a Fact
- Organization can be tagged in Facts

---

## Configuration (.env)

All values are configurable. See `.env.example` for full list:

- APP_PORT, PUBLIC_URL
- Database credentials
- Redis credentials  
- Mail server config
- LLM API key
- Trust score values
- Vote weights
- Ban durations
- Rate limits

---

## Testing Strategy

### Test Files Location

- Unit tests: Next to source files (`*.test.ts`)
- API tests: `tests/api/`
- Test utilities: `tests/helpers.ts`

### Running Tests

```bash
npm run test              # All tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage
npm run test -- --filter "trust"  # Filter by name
```

### Test Database

Uses separate test database, auto-reset before runs.

---

## Development Workflow

1. Read requirement from REQUIREMENTS.md
2. Implement feature
3. Write unit tests
4. Run `npm run test`
5. If tests pass: `git add . && git commit -m "[RX] Description"`
6. Update PROGRESS.md
7. Continue to next requirement

---

## Key Business Rules

### Trust Score

| Action | Points |
|--------|--------|
| Fact approved | +10 |
| Fact wrong | -20 |
| Fact outdated | 0 |
| Successful veto | +5 |
| Failed veto | -5 |
| Verification correct | +3 |
| Verification wrong | -10 |
| Upvoted | +1 |
| Downvoted | -1 |

### Vote Weight Modifiers

| Trust Score | Modifier |
|-------------|----------|
| 100+ | 1.5x |
| 50-99 | 1.2x |
| 0-49 | 1.0x |
| -1 to -25 | 0.5x |
| -26 to -50 | 0.25x |
| Below -50 | 0x |

### User Types & Base Vote Weight

| Type | Weight |
|------|--------|
| Anonymous | 0.1 |
| Verified | 2 |
| Expert | 5 |
| PhD | 8 |
| Organization | 100 |
| Moderator | 3 |

---

## Starting Point

When you read this file, look for `REQUIREMENTS.md` and `PROGRESS.md` in the same directory.

1. If starting fresh: Begin with R1
2. If continuing: Check PROGRESS.md for last completed requirement
3. Work through requirements in order
4. Respect dependencies noted in requirements

**Start command:** "Read CLAUDE.md and start the workflow"  
**Continue command:** "Continue from PROGRESS.md"
