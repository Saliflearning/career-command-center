# Contributing

Small, focused pull requests are welcome.

## Before opening a pull request

```bash
npm ci
npm run safety:self-test
npm run safety:current
npm run lint
npm run typecheck
npm test -- --runInBand --silent
npm run build
npm audit --audit-level=high
```

Use synthetic test data only. Do not submit real resumes, contact details, credentials, production logs, private screenshots, or copied environment values.

Describe the problem, the chosen approach, the tests added or changed, and any security or privacy implications. Keep unrelated formatting or dependency changes separate.
