# Research: Database Baseline Recovery

## Decision: Use Prisma's baseline workflow

Prisma's documented workflow for an existing database is to create a complete initial migration and mark that migration as already applied on databases whose schema already exists. This prevents create-table statements from running over production data.

**Rationale**: It creates one auditable source of truth for fresh recovery while preserving existing data through explicit reconciliation.

**Alternatives considered**:

- Continue using `prisma db push`: rejected because it does not provide an auditable migration history.
- Reset production and replay migrations: rejected because production data must be preserved.
- Treat a schema dump as the only restore path: rejected because it would drift from the application's migration workflow.

## Decision: Keep the existing incremental migration

The existing Golden Path migration follows the new baseline. Its `ADD COLUMN IF NOT EXISTS` clauses are idempotent when the complete baseline already contains those fields.

**Rationale**: Retaining it preserves the public history and tests the actual ordered migration chain without duplicate-column failures.

## Decision: Verify on PostgreSQL 17 in CI

CI will start an empty PostgreSQL 17 service, deploy all migrations, inspect tables and RLS, and compare the resulting database with `schema.prisma`.

**Rationale**: A real database catches SQL, ordering, relation, and migration-table failures that static review cannot.

**Alternatives considered**:

- Embedded or simulated PostgreSQL: rejected because it would not prove Prisma Migrate behavior against the supported server.
- Managed production schema: rejected because feature verification must not write to production.
- One-time manual test: rejected because future migrations could silently reintroduce the defect.

## Decision: Enable RLS without public policies

The baseline enables row-level security on every application table. It does not grant anonymous access or create generic `authenticated` policies.

**Rationale**: The application uses server-side Prisma ownership checks. Default-deny RLS remains defense in depth for any Data API exposure without inventing a mismatched Supabase Auth authorization model.

## Current platform considerations

- Managed Supabase currently defaults new databases to PostgreSQL 17.
- Supabase is moving new tables toward explicit Data API exposure; the baseline therefore makes no implicit anon/authenticated grants.
- Prisma 5.22 supports `migrate diff` with `--from-empty`, `--to-schema-datamodel`, script output, and exit-code drift detection.
