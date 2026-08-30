# Synthetic Data Policy

The public repository contains no real candidate profile or private development history.

## Required fixture properties

- fictional names;
- reserved `example.com`, `example.net`, `example.org`, `example.test`, or `local.test` email domains;
- North American fictional phone numbers in the `555-01xx` range;
- fictional employers and institutions when a career narrative is involved;
- transformed dates, locations, metrics, and role history that do not reproduce the repository owner's background;
- empty or explicitly non-functional credential placeholders.

Changing only a person's name is not sufficient. A distinctive combination of employer, dates, location, education, and metrics can still identify someone.

## Enforcement

`scripts/repository-safety.mjs` checks:

- protected-identifier fingerprints without publishing the identifiers;
- non-reserved email domains;
- phone-like values outside the fictional range;
- common credential formats;
- environment and internal-coordination paths;
- the working tree and every commit in public Git history.

The gate runs locally and in CI. Pull requests containing real resumes or private artifacts are not accepted.
