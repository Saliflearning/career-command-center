# Implementation Plan: Database Baseline Recovery

## Technical Context

- **Runtime**: Node.js 24 in CI
- **Database**: PostgreSQL 17
- **Schema tooling**: Prisma ORM 5.22
- **Verification**: Node script, Prisma CLI, GitHub Actions service container
- **Repository boundary**: Fresh sanitized public history; no private fixtures or coordination files

## Constitution Check

The generated project constitution is still an unratified template and defines no enforceable project-specific principles. This plan follows the repository's explicit safety policy, public-history ADR, current CI conventions, and the feature specification's fail-closed production boundary.

## Design

1. Generate `prisma/migrations/0_init/migration.sql` from the current Prisma data model using Prisma 5.22.
2. Append explicit `ENABLE ROW LEVEL SECURITY` statements for all 18 application tables.
3. Retain `20260520_golden_path_sprint` after the baseline; its idempotent column additions become no-ops on a fresh database.
4. Add `scripts/verify-migration-history.mjs`:
   - static mode parses schema models and baseline SQL;
   - database mode verifies tables, RLS, and successful migration records.
5. Add package scripts for static and deployed verification.
6. Add a dedicated CI job with PostgreSQL 17 that runs static verification, `prisma migrate deploy`, deployed verification, and schema drift detection.
7. Add `docs/DATABASE_RECOVERY.md` with separate fresh and existing-database procedures.

## Safety Boundaries

- No command in this increment modifies the production database.
- Existing-database resolution is documented but not automated.
- Resolution requires a verified backup and zero-drift comparison.
- CI credentials are local service-container placeholders only.
- No Data API grants are added.

## Files

- `prisma/migrations/0_init/migration.sql`
- `scripts/verify-migration-history.mjs`
- `.github/workflows/ci.yml`
- `package.json`
- `docs/DATABASE_RECOVERY.md`
- `specs/001-database-baseline-recovery/`

## Verification Plan

1. Static migration coverage verifier passes locally.
2. Repository safety self-test, current-tree scan, and history scan pass.
3. TypeScript, Jest, ESLint, build, and dependency audit pass.
4. GitHub CI applies migrations to an empty PostgreSQL 17 database.
5. Deployed database verifier reports 18 tables, RLS enabled, and two successful migrations.
6. Prisma schema diff exits with no differences.

## Rollback

Before merge, rollback is deleting the feature branch. After merge, revert the feature commit; do not delete migration records from any database. Any existing-database reconciliation has its own backup and recovery checkpoint and is deliberately outside this code-only increment.
