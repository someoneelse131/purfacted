#!/bin/sh
set -e

# Apply migrations if any exist; fall back to schema push before the first
# migration lands (R2 introduces the initial migration).
if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
	npx prisma migrate deploy
else
	npx prisma db push --skip-generate
fi

exec node build
