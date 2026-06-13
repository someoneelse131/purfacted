# PurFacted

[![CI](https://github.com/someoneelse131/purfacted/actions/workflows/ci.yml/badge.svg)](https://github.com/someoneelse131/purfacted/actions/workflows/ci.yml)

Community fact verification platform. Claims are proven or refuted through
**community-evaluated evidence** (review-first + evidence model), not through
opinion voting on the claim itself.

This is the **v2 rewrite**; v1 is archived under git tag `v1`.
Concept and requirements: [REQUIREMENTS.md](REQUIREMENTS.md) ·
Implementation status: [PROGRESS.md](PROGRESS.md)

## Stack

SvelteKit (Svelte 5) · TypeScript · PostgreSQL · Redis · Prisma · Tailwind CSS ·
Vitest · Playwright · Docker Compose

## Quick Start

```bash
cp .env.example .env          # adjust values if needed
docker compose up             # postgres + redis + app (hot reload) on :3000
```

Or run the app on the host against containerized services:

```bash
docker compose up -d postgres redis
npm install
npm run db:push
npm run dev                   # app on :5173
```

## Testing

```bash
npm run test                  # unit/component tests (Vitest)
npx playwright install chromium   # once, for component + E2E tests
npm run test:e2e              # E2E (Playwright; needs postgres+redis running)
npm run lint                  # prettier + eslint
npm run check                 # svelte-check
```

## Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

Only the app is exposed (`APP_PORT`, default 3000); PostgreSQL and Redis stay
on the internal network. Migrations run automatically on container start.

## Project Layout

```
src/routes/            pages + API endpoints (thin, no business logic)
src/lib/server/        db client, redis client
src/lib/server/services/   business logic (unit-tested in isolation)
src/lib/components/    UI components
prisma/                schema + migrations + seed
e2e/                   Playwright E2E tests
tests/                 API/integration tests
```

All tunable values come from `.env` or the `config` database table - nothing
is hardcoded.
