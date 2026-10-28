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
// StorageModule builds an S3 client at module init. The specs that exercise
// media override StorageService, so dummy credentials are enough to construct
// it without touching the network.
process.env.R2_ENDPOINT ??= 'https://e2e.r2.cloudflarestorage.com';
process.env.R2_ACCESS_KEY_ID ??= 'e2e-access-key';
process.env.R2_SECRET_ACCESS_KEY ??= 'e2e-secret-key';
process.env.R2_BUCKET ??= 'e2e-media-bucket';
