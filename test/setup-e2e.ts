// Runs before any spec module is imported (see `setupFiles` in
// jest-e2e.json). ConfigModule validates DATABASE_URL when AppModule is
// evaluated, and static imports execute before any statement in a spec file,
// so the fallback must live here rather than in a spec. PrismaService is
// overridden with a mock in the specs, so no real connection is ever made
// with this password-less dummy value.
process.env.DATABASE_URL ??=
  'postgresql://postgres@localhost:5432/unstack-learning';
// PushService reads VAPID keys lazily and only warns without them, but the
// push e2e exercises the send path: throwaway non-empty values keep that
// deterministic everywhere (web-push itself is mocked in those specs).
process.env.VAPID_PUBLIC_KEY ??= 'e2e-test-public-key';
process.env.VAPID_PRIVATE_KEY ??= 'e2e-test-private-key';
process.env.VAPID_SUBJECT ??= 'mailto:e2e@example.com';
