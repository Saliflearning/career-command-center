# Contract: Migration Bootstrap Gate

## Inputs

- Checked-in Prisma schema
- Ordered migration directory
- Empty PostgreSQL 17 database

## Required outcomes

- Migration deployment exits zero.
- All schema model tables exist in `public`.
- All schema model tables have RLS enabled.
- Every checked-in migration has one successful migration record.
- Database-to-schema diff is empty.

## Failure outcomes

The gate fails on SQL errors, missing tables, disabled RLS, failed/incomplete migration records, or schema drift. It never repairs the database automatically.
