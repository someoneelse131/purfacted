#!/bin/sh
set -e

echo "Waiting for database to be ready..."

# Wait for PostgreSQL to be ready
until nc -z postgres 5432; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

echo "PostgreSQL is up - running migrations..."

# Push Prisma schema to database (creates tables if they don't exist)
npx prisma db push --skip-generate

echo "Database schema is up to date!"

# Seed database if categories table is empty (first run)
echo "Checking if database needs seeding..."
CATEGORY_COUNT=$(echo "SELECT COUNT(*) FROM categories;" | npx prisma db execute --stdin 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")

if [ "$CATEGORY_COUNT" = "0" ] || [ -z "$CATEGORY_COUNT" ]; then
  echo "Database is empty - running seed..."
  npm run db:seed
  echo "Database seeded successfully!"
else
  echo "Database already has data - skipping seed."
fi

# Execute the main command
exec "$@"
