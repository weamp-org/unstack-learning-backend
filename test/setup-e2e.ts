// Runs before any spec module is imported (see `setupFiles` in
// jest-e2e.json). ConfigModule validates DATABASE_URL when AppModule is
// evaluated, and static imports execute before any statement in a spec file,
// so the fallback must live here rather than in a spec. PrismaService is
// overridden with a mock in the specs, so no real connection is ever made
// with this password-less dummy value.
process.env.DATABASE_URL ??=
  'postgresql://postgres@localhost:5432/unstack-learning';
