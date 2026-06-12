# PurFacted 2.0 - multi-stage build
# target "dev"  -> hot-reload dev server (source bind-mounted by compose)
# target "prod" -> slim production image

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && npm run dev -- --host 0.0.0.0 --port 3000"]

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/build ./build
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
