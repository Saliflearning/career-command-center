# Data Model: Database Baseline Recovery

This feature does not add application entities. It makes the existing 18-model schema reproducible.

## Migration Record

- `migration_name`: ordered migration directory name
- `checksum`: Prisma-managed SQL checksum
- `started_at`: execution start
- `finished_at`: successful completion
- `rolled_back_at`: failure-recovery marker
- `logs`: Prisma-managed execution diagnostics

## Verification Result

- expected model-table names
- discovered public-table names
- RLS-enabled table names
- successfully applied migration names
- missing or unexpected items
- schema drift exit status

## State Transitions

```text
Empty database -> baseline applied -> incremental migration applied -> verified
Existing database -> backup verified -> schema equivalence proven
                  -> baseline resolved as applied -> later migrations deployed
```

Any missing backup, drift, failed migration, missing table, or disabled RLS transitions to `STOP`, not automatic repair.
