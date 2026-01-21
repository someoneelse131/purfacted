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

# Execute the main command
exec "$@"
