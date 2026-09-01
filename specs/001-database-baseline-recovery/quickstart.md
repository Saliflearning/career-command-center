# Quickstart: Database Migration Verification

## Static verification

```bash
npm ci
npm run db:verify:migrations
```

## Disposable PostgreSQL verification

Set `DATABASE_URL` and `DIRECT_URL` to the same empty disposable PostgreSQL 17 database, then run:

```bash
npx prisma migrate deploy
npm run db:verify:deployed
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

The final command exits zero only when no Prisma-supported drift exists.

Never point this quickstart at production. Existing databases use the separately reviewed reconciliation procedure in `docs/DATABASE_RECOVERY.md`.
