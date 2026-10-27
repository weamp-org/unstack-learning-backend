# Unstack Learning Backend

The [NestJS](https://nestjs.com/) 11 API for Unstack Learning, with Clerk authentication, Prisma ORM, role-based access control, and pre-commit lint-staged hooks.

## Features

- **Authentication** — Clerk-powered via `@clerk/express` with global middleware, guards, and auto-provisioning of local user records on first sign-in
- **Authorization** — Role-based access control with `@Roles()` decorator and `RolesGuard` (`STUDENT` / `TEACHER` / `ADMIN` roles)
- **Database** — Prisma v7 with PostgreSQL via `@prisma/adapter-pg`, auto-generated typed client, migration workflow
- **REST API** — Global `/api/v1` prefix, public health endpoint, `ValidationPipe` with whitelist/transform (with implicit conversion)
- **Webhooks** — Clerk webhook handler for `user.created` / `user.updated` / `user.deleted` events with signature verification
- **Rate Limiting** — `@nestjs/throttler`, 100 requests/min per authenticated user (IP fallback for anonymous traffic)
- **Logging** — Structured JSON logging with `nestjs-pino`, request/response auto-logging, request ID propagation, sensitive header redaction, and a global exception filter
- **Documentation** — Swagger UI at `/api/v1/documentation` (dev only), auto-generated from decorators and JSDoc
- **Testing** — Jest unit tests (with mocked Prisma) and Supertest e2e tests
- **Git hooks** — Husky + lint-staged pre-commit hook (auto-installed on `pnpm install`)
- **Tooling** — ESLint flat config (typescript-eslint + prettier), Docker Compose for local PostgreSQL

## Prerequisites

- [Node.js](https://nodejs.org/) 24+
- [pnpm](https://pnpm.io/) 11.2.2 (`npm install -g pnpm@11.2.2`)
- [Docker](https://www.docker.com/) (for local PostgreSQL)
- A [Clerk](https://clerk.com/) application (for authentication)

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Set up Docker secrets
cp secrets/postgres_password.txt.example secrets/postgres_password.txt
# Edit secrets/postgres_password.txt with your desired PostgreSQL password

# 3. Configure environment variables
cp .env.local.example .env.local
# Edit .env.local with your Clerk keys from https://dashboard.clerk.com and
# ensure DATABASE_URL matches the password set in step 2

# 4. Start PostgreSQL via Docker
docker compose up -d

# 5. Run database migrations
pnpm prisma migrate dev

# 6. Start the development server
pnpm start:dev
```

The API is now available at `http://localhost:3000/api/v1`. Swagger docs at `http://localhost:3000/api/v1/documentation`.

## Docker setup

The project uses [Docker Compose](compose.yaml) to run PostgreSQL with [Docker secrets](https://docs.docker.com/compose/use-secrets/) for secure credential management.

```yaml
# compose.yaml (relevant excerpt)
services:
  postgres:
    image: postgres:18
    environment:
      POSTGRES_DB: unstack-learning
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets:
      - postgres_password

secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
```

### Secrets

| File                                    | Purpose                                 |
| --------------------------------------- | --------------------------------------- |
| `secrets/postgres_password.txt`         | Actual PostgreSQL password (gitignored) |
| `secrets/postgres_password.txt.example` | Template with a placeholder value       |

1. Copy the example to create your secret file: `cp secrets/postgres_password.txt.example secrets/postgres_password.txt`
2. Edit the password to your desired value
3. Ensure the `DATABASE_URL` in `.env.local` uses the same password — e.g. `postgresql://postgres:your-password-here@localhost:5432/unstack-learning`

> **Note:** `POSTGRES_DB` only takes effect when the volume is first initialized. If your local `postgres-data` volume was created before the rename from `nestjs-template`, either create the `unstack-learning` database manually (`CREATE DATABASE "unstack-learning";`) or, if the volume holds no valuable data, recreate it with `docker compose down -v && docker compose up -d`. Production (Render) only uses `DATABASE_URL`.

> **Note:** The `secrets/` directory is gitignored. Only the `*.example` file is tracked in version control.

## Project structure

```text
unstack-learning-backend/
├── compose.yaml                    # Docker Compose (PostgreSQL 18, local dev)
├── prisma.config.ts                # Prisma config (dotenv + defineConfig)
├── prisma/
│   ├── schema.prisma               # Database schema (User model, UserRole enum)
│   └── migrations/                 # Migration history
├── src/
│   ├── main.ts                     # Entry point (env validation, global prefix, Clerk, CORS, Swagger, ValidationPipe)
│   ├── app.module.ts               # Root module (imports all features)
│   ├── app.controller.ts           # Public health endpoint (GET /api/v1)
│   ├── app.service.ts              # Health service
│   ├── clerk-auth/
│   │   └── clerk-auth.guard.ts     # Clerk authentication guard (auto-provisions users as STUDENT)
│   ├── public/
│   │   └── public.decorator.ts     # @Public() — bypass auth on routes
│   ├── roles/
│   │   ├── roles.decorator.ts      # @Roles() — require specific roles
│   │   └── roles.guard.ts          # Roles authorization guard
│   ├── user-clerk-id/
│   │   └── user-clerk-id.decorator.ts # @UserClerkId() — current Clerk user ID param
│   ├── logging/
│   │   ├── pino.config.ts         # Pino configuration (structured JSON, redaction, serializers)
│   │   ├── logging.middleware.ts  # Request ID propagation to response header
│   │   └── routes.ts              # ALL_ROUTES wildcard shared by both middlewares
│   ├── filters/
│   │   └── global-exception.filter.ts # Global exception filter (Prisma translation, sanitized 5xx)
│   ├── prisma/
│   │   ├── prisma.module.ts        # Global Prisma module
│   │   └── prisma.service.ts       # PrismaClient with adapter-pg
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts     # PATCH /api/v1/users/:id/role (admin only)
│   │   ├── users.service.ts
│   │   └── dtos/
│   │       └── update-user-role.dto.ts
│   ├── subjects/
│   │   ├── subjects.module.ts
│   │   ├── subjects.controller.ts  # CRUD /api/v1/subjects (public reads, admin writes)
│   │   ├── subjects.service.ts     # Prisma access + server-generated slugs
│   │   └── dtos/
│   │       ├── create-subject.dto.ts
│   │       └── update-subject.dto.ts
│   ├── teachers/
│   │   ├── teachers.module.ts
│   │   ├── teachers.controller.ts  # /api/v1/teachers/me/subjects + /me/availability (teacher+admin)
│   │   ├── teachers.service.ts     # Transactional subject-set replacement + availability windows
│   │   └── dtos/
│   │       ├── set-teacher-subjects.dto.ts
│   │       ├── create-availability.dto.ts
│   │       └── create-availability-override.dto.ts
│   ├── help-requests/
│   │   ├── help-requests.module.ts
│   │   ├── help-requests.controller.ts # POST/GET/PATCH /api/v1/requests (queue, edit, accept/decline/close/session/feedback)
│   │   ├── help-requests.service.ts    # Active-subject + context gates, scoped reads, first-wins accept, owner edit, learner feedback (+ teacher ping)
│   │   └── dtos/
│   │       ├── create-help-request.dto.ts
│   │       ├── update-help-request.dto.ts  # Owner edit of OPEN requests (topic/details/links)
│   │       ├── accept-help-request.dto.ts  # Manual meeting link (any platform) + future time
│   │       ├── update-help-session.dto.ts
│   │       └── upsert-feedback.dto.ts      # Rating 1-5 + optional comment
│   ├── notifications/
│   │   ├── notifications.module.ts
│   │   ├── notifications.controller.ts # GET/PATCH /api/v1/notifications/me (any role)
│   │   ├── notifications.service.ts    # Availability-gated fan-out + stale-request escalation (+ push per event)
│   │   └── availability.ts             # Pure isAvailableNow (weekly + dated overrides) + cutoff helpers
│   ├── push/
│   │   ├── push.module.ts
│   │   ├── push.controller.ts # POST/DELETE/GET /api/v1/push/subscriptions + POST /test (any role, self-scoped)
│   │   └── push.service.ts    # Subscription store + web-push sender with dead-endpoint pruning
│   └── webhooks/
│       ├── webhooks.module.ts
│       ├── webhooks.controller.ts  # POST /api/v1/webhooks/clerk
│       └── webhooks.service.ts     # Clerk webhook event handlers
├── test/
│   ├── jest-e2e.json               # E2E Jest config
│   ├── app.e2e-spec.ts
│   ├── help-requests.e2e-spec.ts
│   ├── notifications.e2e-spec.ts
│   ├── push.e2e-spec.ts
│   ├── subjects.e2e-spec.ts
│   ├── teachers.e2e-spec.ts
│   └── users.e2e-spec.ts
├── .husky/                         # Git hooks (created on pnpm install)
└── secrets/                        # Docker secrets (gitignored, see secrets/*.txt.example)
```

## Configuration

The template uses two env files loaded in order: `.env.local` (local overrides, gitignored) then `.env` (shared defaults, gitignored). Copy the example file to get started:

| Variable                       | Required | Default                 | Description                                                                                                         |
| ------------------------------ | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Yes      | —                       | PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/unstack-learning`)                |
| `CLERK_PUBLISHABLE_KEY`        | Yes      | —                       | Clerk publishable API key                                                                                           |
| `CLERK_SECRET_KEY`             | Yes      | —                       | Clerk secret API key                                                                                                |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Yes\*    | —                       | Clerk webhook signing secret (required for webhook verification)                                                    |
| `FRONTEND_BASE_URL`            | Yes†     | `http://localhost:3001` | Allowed CORS origin (must be set in production)                                                                     |
| `VAPID_PUBLIC_KEY`             | No‡      | —                       | Web-push public key (`web-push generate-vapid-keys`); also needed by the frontend as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY`            | No‡      | —                       | Web-push private key (required in production alongside the public key and subject)                                  |
| `VAPID_SUBJECT`                | No‡      | —                       | Contact URI for push services, e.g. `mailto:hello@unstacklearning.weamp.org`                                        |
| `R2_ACCOUNT_ID`                | Yes§     | —                       | Cloudflare account ID (used to build the endpoint when `R2_ENDPOINT` is absent)                                     |
| `R2_ENDPOINT`                  | No§      | derived                 | S3 endpoint, `https://<account-id>.r2.cloudflarestorage.com`                                                        |
| `R2_ACCESS_KEY_ID`             | Yes§     | —                       | R2 API token access key (Object Read & Write, scoped to the bucket)                                                 |
| `R2_SECRET_ACCESS_KEY`         | Yes§     | —                       | R2 API token secret                                                                                                 |
| `R2_BUCKET`                    | Yes§     | —                       | Private bucket for request media (e.g. `unstack-learning-media`)                                                    |
| `PORT`                         | No       | `3000`                  | Application port                                                                                                    |
| `NODE_ENV`                     | No       | `development`           | Set to `production` to disable Swagger                                                                              |
| `LOG_LEVEL`                    | No       | `info`/`debug`          | Pino log level (`info` in production, `debug` otherwise)                                                            |

\* Required for the Clerk webhook flow, which keeps the local `User` table in sync.
† Enforced at startup in production; falls back to `http://localhost:3001` with a warning otherwise.
‡ Subscribing works without VAPID keys, but sending (including `POST /push/test`) 503s; all three are enforced at startup in production.
§ Media uploads presign directly to R2, so the app starts but `/media/*` fails without these; enforced at startup in production.

## Scripts

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `pnpm install`            | Install all dependencies                             |
| `pnpm start:dev`          | Start dev server with file watching                  |
| `pnpm start:debug`        | Start dev server in debug mode                       |
| `pnpm start:prod`         | Run compiled production build (`node dist/src/main`) |
| `pnpm build`              | Compile to `dist/` (`deleteOutDir: true`)            |
| `pnpm lint`               | Run ESLint on source and test files                  |
| `pnpm format`             | Format source files with Prettier                    |
| `pnpm format:check`       | Check formatting (CI use)                            |
| `pnpm typecheck`          | Run `tsc --noEmit` for type errors                   |
| `pnpm test`               | Run unit tests (Jest, `*.spec.ts`)                   |
| `pnpm test:e2e`           | Run e2e tests (Jest, `*.e2e-spec.ts`)                |
| `pnpm test:cov`           | Run unit tests with coverage                         |
| `pnpm prisma generate`    | Regenerate Prisma client after schema changes        |
| `pnpm prisma migrate dev` | Create and apply a new migration                     |
| `pnpm prisma db seed`     | Seed the database (`prisma/seed.ts`, idempotent)     |

## API overview

All endpoints are prefixed with `/api/v1`.

| Method   | Path                             | Auth                                            | Description                                                                                 |
| -------- | -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`    | `/`                              | Public                                          | Health check (`{ status }`)                                                                 |
| `POST`   | `/requests`                      | Any signed-in user                              | Learner creates a help request (subject must be active)                                     |
| `GET`    | `/requests/me`                   | Any signed-in user                              | List my requests (newest first, with teacher/session/feedback)                              |
| `GET`    | `/requests/queue`                | Teacher, Admin                                  | Open requests in my subjects, oldest first (stale escalation runs here until a cron exists) |
| `GET`    | `/requests/:id`                  | Owner, assigned teacher, subject teacher, Admin | Scoped read (404 to hide existence)                                                         |
| `PATCH`  | `/requests/:id`                  | Owner, `OPEN` only                              | Edit topic/details/links (links replace all; subject frozen)                                |
| `PATCH`  | `/requests/:id/accept`           | Teacher of subject, Admin                       | First-accept wins (`409` once taken); optional manual meeting link + future time            |
| `PATCH`  | `/requests/:id/decline`          | Teacher of subject, Admin                       | Per-teacher decline; request stays `OPEN` for others                                        |
| `PATCH`  | `/requests/:id/close`            | Owner, assigned teacher, Admin                  | Terminal close (idempotent, no reopen — new help = new request)                             |
| `PATCH`  | `/requests/:id/session`          | Assigned teacher, Admin                         | Update manual meeting link / future time (any platform: Zoom, Meet, etc)                    |
| `POST`   | `/requests/:id/feedback`         | Owner, once `ACCEPTED`/`CLOSED`                 | Upsert rating `1-5` + optional comment (share after your session)                           |
| `GET`    | `/requests/:id/feedback`         | Owner, assigned teacher, Admin                  | Read the learner's feedback                                                                 |
| `POST`   | `/subjects`                      | Admin only                                      | Create a subject (slug server-generated)                                                    |
| `GET`    | `/subjects`                      | Public (`?includeInactive` admin-only)          | List subjects                                                                               |
| `GET`    | `/subjects/:id`                  | Public                                          | Read one subject                                                                            |
| `PATCH`  | `/subjects/:id`                  | Admin only                                      | Rename / describe / activate                                                                |
| `DELETE` | `/subjects/:id`                  | Admin only                                      | Refused once referenced (deactivate instead)                                                |
| `GET`    | `/teachers/me/subjects`          | Teacher, Admin                                  | My teachable subjects                                                                       |
| `PUT`    | `/teachers/me/subjects`          | Teacher, Admin                                  | Replace teachable subjects                                                                  |
| `GET`    | `/teachers/me/availability`      | Teacher, Admin                                  | Weekly windows                                                                              |
| `POST`   | `/teachers/me/availability`      | Teacher, Admin                                  | Add a window (no overlap / overnight)                                                       |
| `DELETE` | `/teachers/me/availability/:id`  | Teacher, Admin                                  | Remove a window                                                                             |
| `GET`    | `/teachers/me/overrides`         | Teacher, Admin                                  | One-off exceptions (today + future)                                                         |
| `POST`   | `/teachers/me/overrides`         | Teacher, Admin                                  | Add an exception                                                                            |
| `DELETE` | `/teachers/me/overrides/:id`     | Teacher, Admin                                  | Remove an exception                                                                         |
| `GET`    | `/users/me`                      | Any signed-in user                              | My profile + role                                                                           |
| `GET`    | `/users`                         | Admin only                                      | Roster (newest first, `take: 50`, `?q=&role=`)                                              |
| `PATCH`  | `/users/:id/role`                | Admin only                                      | Assign a user role (`STUDENT` / `TEACHER` / `ADMIN`)                                        |
| `GET`    | `/notifications/me`              | Any signed-in user                              | My inbox (`?unreadOnly`)                                                                    |
| `GET`    | `/notifications/me/unread-count` | Any signed-in user                              | Unread total                                                                                |
| `PATCH`  | `/notifications/me/read-all`     | Any signed-in user                              | Mark all read                                                                               |
| `PATCH`  | `/notifications/:id/read`        | Owner only                                      | Mark one read                                                                               |
| `PATCH`  | `/notifications/:id/archive`     | Owner only                                      | Archive one (soft delete)                                                                   |
| `PATCH`  | `/notifications/:id/restore`     | Owner only                                      | Put an archived row back in the inbox                                                       |
| `PATCH`  | `/notifications/me/archive-all`  | Any signed-in user                              | Archive read rows (`?readOnly=false` for all)                                               |
| `DELETE` | `/notifications/archive`         | Any signed-in user                              | Permanently delete everything archived                                                      |
| `DELETE` | `/notifications/:id`             | Owner only                                      | Permanently delete one archived row                                                         |
| `POST`   | `/media/uploads`                 | Any signed-in user                              | Reserve a media upload, returns a presigned R2 PUT                                          |
| `POST`   | `/media/uploads/:id/complete`    | Owner only                                      | Verify the uploaded object (size + magic bytes) and mark it ready                           |
| `DELETE` | `/media/uploads/:id`             | Owner only                                      | Discard an upload that was never attached                                                   |
| `POST`   | `/notifications/escalate`        | Admin only                                      | Manually re-notify stale `OPEN` requests (>45 min)                                          |
| `POST`   | `/push/subscriptions`            | Any signed-in user                              | Subscribe this device                                                                       |
| `DELETE` | `/push/subscriptions`            | Any signed-in user                              | Unsubscribe                                                                                 |
| `GET`    | `/push/subscriptions/me`         | Any signed-in user                              | My subscriptions                                                                            |
| `POST`   | `/push/test`                     | Any signed-in user                              | Send a test push (503 without VAPID keys)                                                   |
| `GET`    | `/admin/stats`                   | Admin only                                      | Global counts                                                                               |
| `POST`   | `/webhooks/clerk`                | Public (signature-verified, skip throttle)      | Clerk webhook events                                                                        |

Local `User` records are created and synced automatically by `ClerkAuthGuard`
(on first authenticated request, default role `STUDENT`) and the Clerk webhook
handler. Roles are assigned via `PATCH /users/:id/role` (admin only — admins
cannot change their own role, so access can never be locked out) or directly
in the database. No other API accepts a `role` field, so users cannot
escalate themselves to `TEACHER` or `ADMIN`.

## Auth model

The API implements a layered auth strategy:

1. **Global middleware** — `clerkMiddleware()` from `@clerk/express` runs on every request, parsing the session JWT and attaching user identity to `req.auth`
2. **Guard layer** — `ClerkAuthGuard` (applied per controller via `@UseGuards`) rejects unauthenticated requests. It also **auto-provisions** a local `User` record on first sign-in: if the Clerk user ID isn't in your database, it fetches the user from the Clerk API and inserts them with the default `STUDENT` role
3. **Bypass** — `@Public()` decorator skips the guard for public routes (health check, webhooks)
4. **RBAC** — `@Roles(...)` decorator combined with `RolesGuard` restricts endpoints to specific roles (`STUDENT` / `TEACHER` / `ADMIN`). `RolesGuard` checks `@Public()` first, then verifies the user's role from the local database

See [docs/auth.md](docs/auth.md) for a detailed walkthrough.

## Development

- **Add a new resource** — See [docs/new-resource.md](docs/new-resource.md) for a step-by-step guide
- **Database changes** — Edit `prisma/schema.prisma`, run `pnpm prisma migrate dev`, then `pnpm prisma generate`
- **Testing** — See [docs/testing.md](docs/testing.md) for patterns and conventions
- **Logging** — See [docs/logging.md](docs/logging.md) for the middleware route pattern, `originalUrl` vs `req.url`, and known limitations

## Deployment

1. Set `NODE_ENV=production`
2. Ensure all required environment variables are set
3. Run `pnpm build` to compile to `dist/`
4. Start with `pnpm start:prod`

See [docs/deployment.md](docs/deployment.md) for a full checklist.

## License

[MIT](LICENSE)
