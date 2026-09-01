# Feature Specification: Database Baseline Recovery

**Feature Branch**: `codex/database-baseline-recovery`
**Created**: 2026-08-31
**Status**: In progress

## Overview

Career Command Center must be recoverable from source control without relying on an undocumented database created by `db push` or manual SQL. The repository currently contains only an incremental migration that assumes the `Resume` table already exists. This feature establishes a complete, auditable migration baseline and makes fresh-database recovery a permanent release check.

## User Scenarios & Testing

### User Story 1 - Restore the application database (Priority: P1)

As an operator recovering the service, I can apply the checked-in migration history to an empty supported PostgreSQL database and obtain the complete schema expected by the application.

**Independent test**: Run the repository migration command against an empty PostgreSQL 17 database and confirm every application table, enum, key, relation, and index exists.

**Acceptance scenarios**:

1. **Given** an empty PostgreSQL 17 database, **when** all checked-in migrations are deployed, **then** deployment completes without manual schema creation.
2. **Given** the deployed migration history, **when** it is compared with the application schema, **then** no Prisma-supported drift is reported.
3. **Given** the deployed public application tables, **when** their security metadata is inspected, **then** row-level security is enabled on every table.

### User Story 2 - Reconcile an existing database safely (Priority: P1)

As an operator with an existing production database, I have a documented baseline procedure that preserves data and prevents the baseline from being executed over existing tables.

**Independent test**: Review the recovery runbook and confirm it requires a verified backup, schema-equivalence proof, and an explicit baseline resolution before deployment.

**Acceptance scenarios**:

1. **Given** an existing database with valuable data, **when** an operator follows the runbook, **then** no reset or blind schema push is used.
2. **Given** a schema that is proven equivalent to the baseline, **when** the baseline is marked as already applied, **then** only later idempotent migrations remain deployable.
3. **Given** schema differences or a missing backup, **when** reconciliation is attempted, **then** the runbook requires the operator to stop.

### User Story 3 - Prevent migration regressions (Priority: P2)

As a maintainer, I receive an automated failure before merge when migrations cannot recreate the current schema or when a model table loses its row-level-security declaration.

**Independent test**: Run the migration verification job in CI against a clean database and deliberately remove one table or RLS declaration to confirm the gate fails.

## Edge Cases

- The existing incremental migration remains after the baseline and encounters columns that the full baseline already created.
- A developer adds a model but forgets to update migration history.
- A migration succeeds but leaves a Prisma-supported difference from the schema.
- A table exists but row-level security is disabled.
- A production URL is accidentally supplied to local verification.
- The database is not empty, contains an incomplete migration history, or has failed migration rows.

## Functional Requirements

- **FR-001**: The repository MUST contain one baseline migration that creates every model, enum, index, foreign key, and uniqueness constraint represented by the current application schema.
- **FR-002**: The baseline MUST sort before the existing incremental migration.
- **FR-003**: The existing incremental migration MUST remain deployable after the baseline without destructive behavior.
- **FR-004**: Every application table created in `public` MUST have row-level security enabled.
- **FR-005**: A repository verifier MUST fail when a schema model is absent from the baseline or lacks an RLS declaration.
- **FR-006**: CI MUST deploy the complete migration history to an empty PostgreSQL 17 database.
- **FR-007**: CI MUST compare the deployed database with the checked-in application schema and fail on Prisma-supported drift.
- **FR-008**: CI MUST inspect the deployed database and fail on missing application tables, disabled RLS, or unsuccessful migration records.
- **FR-009**: The recovery runbook MUST distinguish fresh restore from existing-database reconciliation.
- **FR-010**: Existing-database reconciliation MUST require a verified backup, a zero-drift comparison, and explicit baseline resolution before migration deployment.
- **FR-011**: The implementation MUST NOT execute DDL against the production database.
- **FR-012**: No credentials, project-specific connection strings, personal data, or internal coordination records may enter the public repository.

## Key Entities

- **Baseline migration**: Complete SQL representation of the current application schema before Prisma Migrate history is adopted.
- **Incremental migration**: Existing idempotent change that follows the baseline and remains part of history.
- **Migration verification report**: Automated result covering model tables, RLS, migration completion, and schema drift.
- **Recovery runbook**: Operator instructions for fresh restoration and safe reconciliation of an existing database.

## Assumptions

- PostgreSQL 17 is the supported verification target and matches current managed Supabase defaults.
- Prisma ORM 5.22 remains the schema and migration tool for this increment.
- Application model tables are not intentionally exposed to anonymous Data API access.
- The existing incremental migration uses `IF NOT EXISTS` and can safely follow a complete baseline.

## Success Criteria

- **SC-001**: A clean PostgreSQL 17 database reaches the complete application schema with one migration-deploy command and no manual SQL.
- **SC-002**: The post-deploy schema comparison reports zero Prisma-supported differences.
- **SC-003**: All 18 current application model tables exist and have row-level security enabled.
- **SC-004**: Both checked-in migrations are recorded as successfully applied.
- **SC-005**: Pull requests cannot pass CI when migration bootstrap, schema parity, or RLS coverage fails.
- **SC-006**: The production database receives zero writes during development and verification of this feature.
