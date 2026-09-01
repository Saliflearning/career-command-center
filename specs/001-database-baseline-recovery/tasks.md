# Tasks: Database Baseline Recovery

## Phase 1 - Setup

- [x] T001 Create the feature specification and research artifacts in `specs/001-database-baseline-recovery/`
- [x] T002 Install the public snapshot dependencies from `package-lock.json`

## Phase 2 - Foundational

- [x] T003 Generate the full Prisma 5.22 baseline in `prisma/migrations/0_init/migration.sql`
- [x] T004 Add default-deny RLS declarations for every application model table in `prisma/migrations/0_init/migration.sql`

## Phase 3 - User Story 1: Fresh Restore

- [x] T005 [US1] Add static and deployed migration checks in `scripts/verify-migration-history.mjs`
- [x] T006 [US1] Add migration verification commands in `package.json`
- [x] T007 [US1] Add the PostgreSQL 17 migration-bootstrap job in `.github/workflows/ci.yml`

## Phase 4 - User Story 2: Existing Database Reconciliation

- [x] T008 [US2] Document backup, zero-drift comparison, baseline resolution, and stop conditions in `docs/DATABASE_RECOVERY.md`

## Phase 5 - User Story 3: Regression Prevention

- [ ] T009 [US3] Run local static migration verification and repository safety gates
- [x] T010 [US3] Run TypeScript, full Jest, lint, build, dependency audit, and diff checks
- [ ] T011 [US3] Push the branch and require the real PostgreSQL 17 CI migration job to pass

## Phase 6 - Closure

- [ ] T012 Record exact commit, CI run, and remaining production-reconciliation boundary in the public recovery documentation

## Dependencies

- T003-T004 block all implementation verification.
- T005-T006 block T007 and T009.
- T007 and T008 are independently implementable after the baseline exists.
- T010 follows all code and documentation changes.
- T011 is the first real empty-PostgreSQL deployment proof.

## Independent completion criteria

- **US1**: Empty PostgreSQL 17 reaches schema parity through migrations only.
- **US2**: Runbook cannot be followed without backup and equivalence proof.
- **US3**: Removing a model table or RLS declaration makes CI fail.
