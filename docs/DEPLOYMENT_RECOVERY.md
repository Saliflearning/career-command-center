# Deployment Recovery

Career Command Center's production deployment is connected to the public
GitHub repository and tracks its default `main` branch. Vercel must create a
production deployment after every merge to `main`.

## Verify the connection

Before treating a merge as live, verify all of the following:

1. GitHub's default branch is `main`.
2. Vercel's connected repository ID matches the current GitHub repository ID.
3. Vercel's production branch is `main`.
4. The deployment reaches `READY` and targets `production`.
5. `https://career-command-center-hazel.vercel.app/` returns HTTP 200.

Repository IDs matter because deleting and recreating a GitHub repository can
leave Vercel attached to a stale repository with the same owner and name. A
matching display name alone is not proof that automatic deployment works.

## Recover a stale connection

Use the linked project directory and an authenticated Vercel CLI session:

```powershell
vercel whoami
vercel git disconnect
vercel git connect https://github.com/Saliflearning/career-command-center
```

Confirm the disconnect prompt only after checking that the linked Vercel
project is `career-command-center`. Re-read the project configuration after
reconnecting; do not assume the command selected the intended repository or
branch.

If the latest verified merge did not receive an automatic deployment while the
connection was stale, deploy that exact Git commit from a clean checkout:

```powershell
git fetch github main
git switch --detach github/main
vercel deploy --prod --yes --scope busu-gan-s-projects
```

Record the commit, deployment ID, `READY` state, production alias, and HTTP
check in the private coordination log. A successful Git push or local build is
not evidence that production changed.

## Database boundary

Vercel deployment does not run `prisma migrate deploy`. Follow
[`DATABASE_RECOVERY.md`](./DATABASE_RECOVERY.md) separately for database
reconciliation. Never infer that a successful application deployment changed
the production database.
