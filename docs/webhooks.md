# Clerk Webhooks

## Overview

The webhook endpoint at `POST /api/v1/webhooks/clerk` receives events from Clerk (e.g. user created, updated, deleted) via Clerk's webhook system. The handler verifies the signature and keeps the local `User` table in sync with Clerk's user directory.

---

## Configuration

1. In your [Clerk Dashboard](https://dashboard.clerk.com/), go to **Webhooks** and add an endpoint pointing to `https://your-domain.com/api/v1/webhooks/clerk`
2. Copy the **Signing Secret** and set it as `CLERK_WEBHOOK_SIGNING_SECRET` in your `.env.local`
3. Subscribe to the following events: `user.created`, `user.updated`, `user.deleted`

---

## Endpoint

```http
POST /api/v1/webhooks/clerk
Content-Type: application/json
svix-id: <id>
svix-timestamp: <timestamp>
svix-signature: <signature>
```

The endpoint uses `@SkipThrottle()` so it bypasses rate limiting.

### Responses

All responses have an empty body; only the status code is significant:

| Status            | When                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `204 No Content`  | Webhook processed successfully, skipped (already in sync), or event type is not handled |
| `400 Bad Request` | Missing user ID, signature verification failure, or handler error                       |

---

## Event handling (`src/webhooks/webhooks.service.ts`)

### Signature verification

Incoming webhooks are verified using `verifyWebhook` from `@clerk/express/webhooks`. The signing secret is read from the `CLERK_WEBHOOK_SIGNING_SECRET` environment variable. If verification fails, the request is rejected with `400`.

### Event types

#### `user.created`

```ts
case 'user.created':
  await this.prisma.user.upsert({
    where: { id: data.id },
    create: { id: data.id, name, email },
    update: { name, email },
  });
```

Upserts the user — creates if new, updates if already exists (handles retries or race conditions).

#### `user.updated`

```ts
// existence check is handled in handleClerkWebhook before dispatch
await this.prismaService.user.update({
  where: { id: userClerkId },
  data: { name, email },
});
```

Only updates if the user already exists locally (the routing method checks existence before calling this handler). This prevents creating local records for Clerk users that were not auto-provisioned by `ClerkAuthGuard`.

#### `user.deleted`

```ts
// existence check is handled in handleClerkWebhook before dispatch
await this.prismaService.user.delete({
  where: { id: userClerkId },
});
```

Only deletes if the user exists locally. The routing method silently skips deletion if the user was never created locally.

### Error handling

- Missing `data.id` in any event → `400` (empty body)
- Unknown event type → `204` (empty body; logged as a warning and ignored)
- Signature verification failure or any other handler exception → `400` (empty body, details in server logs)

---

## Testing webhooks locally

1. Use the [Clerk CLI](https://clerk.com/docs/reference/clerk-cli) to forward webhooks:

```bash
clerk webhook-tunnel http://localhost:3000/api/v1/webhooks/clerk
```

2. Or use a tool like [ngrok](https://ngrok.com/) to expose your local dev server:

```bash
ngrok http 3000
```

Then paste the ngrok URL into the Clerk Dashboard webhook configuration.
