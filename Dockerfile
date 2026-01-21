# ============================================
# PurFacted - Production Dockerfile
# ============================================
# Multi-stage build for optimized production image

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies needed for native modules and Prisma
RUN apk add --no-cache libc6-compat openssl

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (needed for build)
RUN npx prisma generate

# Build the application
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --omit=dev

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install netcat for database connectivity check in entrypoint
RUN apk add --no-cache netcat-openbsd

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 sveltekit

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set ownership
RUN chown -R sveltekit:nodejs /app

# Switch to non-root user
USER sveltekit

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use entrypoint to run migrations before starting the app
ENTRYPOINT ["docker-entrypoint.sh"]

# Start the application
CMD ["node", "build"]
