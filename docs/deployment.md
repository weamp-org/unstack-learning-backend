# Deployment (Render)

## Prerequisites

- Node.js 24+
- pnpm 11.2.2
- A PostgreSQL database (Render Postgres; local development uses `compose.yaml`)
- A Clerk application with API keys configured

---

## Environment checklist

Ensure these variables are set in production:

| Variable                       | Required | Notes                                                          |
| ------------------------------ | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`                 | Yes      | Production PostgreSQL connection string (Render Postgres)      |
| `CLERK_PUBLISHABLE_KEY`        | Yes      | From Clerk Dashboard → API Keys                                |
| `CLERK_SECRET_KEY`             | Yes      | From Clerk Dashboard → API Keys                                |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Yes      | Required for the Clerk webhook flow                            |
| `FRONTEND_BASE_URL`            | Yes      | Your Vercel frontend domain (CORS origin); enforced at startup |
| `PORT`                         | No       | Set automatically by Render; defaults to `3000` locally        |
| `NODE_ENV`                     | No       | Set to `production` to disable Swagger                         |
| `LOG_LEVEL`                    | No       | Pino log level (`info` in production, `debug` otherwise)       |

The server fails fast at startup when `DATABASE_URL` is missing, or when any
of `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, or `FRONTEND_BASE_URL` is
missing in production.

---

## Build and run

Prisma CLI and the Nest build tooling live in `devDependencies`, so the build
pipeline needs a full install (not a production-only install):

```bash
# 1. Install dependencies (includes Prisma CLI and Nest CLI)
pnpm install --frozen-lockfile

# 2. Apply database migrations
pnpm prisma migrate deploy

# 3. Generate Prisma client
pnpm prisma generate

# 4. Build the application
pnpm build

# 5. Start the server (set NODE_ENV=production in the process environment)
pnpm start:prod
```

If you ship a prebuilt `dist/` (and already-generated Prisma client) into a
runtime-only image, you can then install production dependencies only with
`pnpm install --frozen-lockfile --prod --ignore-scripts`. Do not use `--prod`
before `prisma generate` or `pnpm build` in this template. `--ignore-scripts`
skips the root `postinstall` (`prisma generate`), which would fail without the
Prisma CLI from `devDependencies`.

---

## Platform notes

The backend deploys to **Render** as a standard Node.js web service
(`dist/` output, `node dist/src/main` entrypoint):

- **Build command** — `pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build`
- **Start command** — `pnpm start:prod` (runs `prisma migrate deploy` first, or set a pre-deploy command to `pnpm prisma migrate deploy`)
- **Database** — Render Postgres, wired via `DATABASE_URL`
- **Local development** — `compose.yaml` runs PostgreSQL 18 via Docker; production uses the hosted database above, not Compose

### Docker

The repository includes `compose.yaml` for local development. For production, build a minimal Docker image:

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN corepack enable && pnpm install --frozen-lockfile
COPY dist ./dist
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/src/main"]
```

---

## Health check

```http
GET /api/v1
```

Returns `200 OK` with `{ "status": "ok", "service": "unstack-learning-backend" }`. Use this as your Render health check path (`/api/v1`).

---

## Production checklist

- [ ] `NODE_ENV=production` set (disables Swagger UI)
- [ ] Database migrations have been applied
- [ ] Clerk webhook endpoint is configured in Clerk Dashboard
- [ ] CORS origin (`FRONTEND_BASE_URL`) points to your production frontend
- [ ] Secrets are stored securely (not in the codebase)
- [ ] PostgreSQL connection uses SSL if required by your provider
- [ ] Logs are captured (stdout) by your infrastructure
