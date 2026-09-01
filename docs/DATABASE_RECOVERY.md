# Database Recovery and Migration Baseline

The repository contains a complete Prisma migration history beginning with `prisma/migrations/0_init`. It can create the current application schema from an empty PostgreSQL 17 database without `prisma db push` or manual table creation.

## Fresh database

Use an empty disposable or replacement database. Set `DATABASE_URL` and `DIRECT_URL` to session-compatible PostgreSQL connections for that database.

```bash
npm ci
npm run db:verify:migrations
npx prisma migrate deploy
npm run db:verify:deployed
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

A successful run creates all 18 application tables, enables row-level security on each table, records both migrations as successful, and reports no Prisma-supported schema drift.

## Existing database with data

Do not run the baseline against existing tables. Do not reset the database and do not substitute `prisma db push`.

1. Create a provider-managed backup or a complete `pg_dump` and verify that the backup is restorable.
2. Use the direct or session-mode connection, not a transaction-pooler URL.
3. Confirm there are no failed migration records:

   ```bash
   npx prisma migrate status
   ```

4. Compare the existing database with the checked-in schema:

   ```bash
   npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   ```

5. Stop if the command reports drift. Review and reconcile the difference before continuing.
6. After backup verification and zero drift, mark only the baseline as already applied:

   ```bash
   npx prisma migrate resolve --applied 0_init
   ```

7. Deploy the remaining migration history. The existing Golden Path migration uses `ADD COLUMN IF NOT EXISTS`, so it is safe when those baseline columns already exist:

   ```bash
   npx prisma migrate deploy
   npm run db:verify:deployed
   ```

8. Re-run the schema diff and application smoke tests before releasing traffic.

## Stop conditions

Stop without changing migration history when any of these is true:

- the backup is absent or has not been restore-tested;
- the target database identity is uncertain;
- the schema comparison reports a difference;
- `_prisma_migrations` contains a failed or rolled-back entry;
- a model table is absent or has RLS disabled;
- the connection points to an unintended project or environment.

Never edit `_prisma_migrations` manually. Use Prisma's documented `migrate resolve` workflow only after the schema-equivalence and backup gates pass.

## Supabase boundary

The application accesses model tables through server-side Prisma and applies user ownership checks in application routes. The baseline enables RLS as default-deny defense in depth, but intentionally creates no generic `anon` or `authenticated` grants or policies. Supabase Storage remains governed separately.

Managed Supabase production reconciliation is an operational change, not part of ordinary application deployment. Record its backup, project identity, schema comparison, exact commands, and post-change verification in a private operational log.

## Verification checkpoint

Product commit `76fc4cbece41f415954075c596563e6a04ea3ecb` was verified in [GitHub Actions run 33469091195](https://github.com/Saliflearning/career-command-center/actions/runs/33469091195). The `Migration Bootstrap` job created an empty PostgreSQL 17 database, deployed `0_init` followed by `20260520_golden_path_sprint`, confirmed all 18 model tables had RLS enabled, and reported zero Prisma-supported schema drift.

The same pull request also passed repository safety, 107 Jest suites with 924 tests, TypeScript, zero-warning ESLint, the 54-page production build, dependency review, dependency audit, and CodeQL. No production database reconciliation or DDL was performed.
