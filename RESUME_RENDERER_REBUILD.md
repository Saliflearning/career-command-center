# Resume renderer rebuild: handoff

**Branch:** `feat/resume-render-engine` (PR #25). **Last updated:** 2026-11-15.

## Status

The new engine is complete, wired in behind a flag, and verified in a real
Vercel serverless runtime. It is **off by default**. Nothing changes for users
until `RESUME_RENDER_ENGINE=react-pdf` is set on a deployment.

## Why

`lib/export/structured-resume-pdf.ts` is a hand-written raw-PDF byte emitter. It
estimates glyph width as `length * size * 0.49`, so wrapping and one-page fit
are fragile and the output looks generic. The new engine
(`lib/export/react-pdf-resume.ts`, built on `@react-pdf/renderer`) measures text
with real font metrics, embeds Source Serif 4 and Source Sans 3, and supports
Latin, extended Latin, and Cyrillic.

## How it fits together

- `lib/export/render-resume-pdf.ts` is the single entry point,
  `renderResumePdf(input)`. It picks the engine from `RESUME_RENDER_ENGINE`
  (`react-pdf` selects the new engine; anything else selects the legacy one).
  The new engine is imported only when the flag selects it, so with the flag off
  none of its dependencies are loaded.
- Callers: `app/api/export/[id]/route.ts` and `lib/resume/visual-quality-gate.ts`.
- Both engines share one contract: `StructuredResumeExportInput` in,
  `StructuredResumePdfResult` out, one page guaranteed, and the same
  `StructuredResumeOverflowError` / `StructuredResumeContentError` on failure.
  Content that cannot fit one page fails with a recoverable error. Neither
  engine drops content to make it fit.
- The new engine honors the saved editor presentation (font, scale, density)
  with the same mapping as the legacy `applyPresentation`.

## Rules the new engine must keep (each one failed in review or testing)

1. **No `letterSpacing` on section headings.** Letter-spaced headings extract as
   separated characters and the visual gate cannot find the section.
2. **No font below 9pt, no page margin below 36pt.** The gate rejects both. The
   engine floors fonts at 9.5pt and margins at 38pt on every density rung, and
   recovers space on dense resumes through line and block spacing instead.
3. **Draw bullet markers; do not use a symbol glyph.** The `U+25AA` glyph
   rendered blank.
4. **Wrapping text inside a flex row needs `flexBasis: 0`.** Without it a long
   skills list overflowed the right margin.
5. **Reject characters the fonts cannot draw** (CJK, Arabic, and similar) with a
   content error. Do not render boxes.

## Two traps that only exist in the production bundle

Jest resolves modules differently from the built server, so the test suites
passed while both of these broke every render in the real bundle.

1. **fontkit must be a namespace import** (`import * as fontkit`). Its ESM build
   has no default export. A default import becomes `undefined` in the bundle.
2. **React must come from Node's resolver, not the bundler.**
   `@react-pdf/renderer` is loaded from `node_modules` at runtime
   (`serverExternalPackages`), so its reconciler runs on the installed React.
   Inside an App Router route handler the bundler rewrites `import "react"` to
   Next's vendored React, and the reconciler rejects those elements (React error
   #31). The engine therefore loads React with
   `process.getBuiltinModule("node:module").createRequire(...)`.

If you touch imports in `react-pdf-resume.ts`, run the smoke test below.

## How to verify

```bash
npm test                    # unit suite (unpdf is mocked here)
npm run test:integration    # real visual gate against both engines
npm run build
npm run test:render-smoke   # starts the built server, renders through each engine
```

`test:integration` needs the real unpdf / PDF.js runtime, which requires
`node --experimental-vm-modules`. The script sets that; plain `jest` cannot run
those files, so they are excluded from `npm test`.

`test:render-smoke` is the only check that exercises the production bundle. CI
runs it after the build.

### Checking a deployment

`GET /api/internal/render-check` renders a fixed built-in sample through the
real dispatcher and the real visual gate, then reports the verdict as JSON. Add
`?format=pdf` or `?format=png` for the artifacts. It takes no input and uses no
database, auth, or storage. It answers 404 unless the deployment sets
`RESUME_RENDER_SELFTEST=1`.

Verified on the Vercel preview for commit `9133024` with the flag on: engine
`react-pdf`, one page, every gate check passed, minimum font 9.5pt.

## Remaining before public launch

1. Merge this PR. With the flag off, production keeps the legacy engine.
2. Set `RESUME_RENDER_ENGINE=react-pdf` in the Production environment and
   redeploy.
3. Run one real resume end to end on the live site: sign in, upload, generate,
   export. Preview deployments of this branch cannot do this because the backend
   secrets exist only in Production.
4. Optional later: a second and third template.

## Rollback

Remove `RESUME_RENDER_ENGINE` from the environment and redeploy. The legacy
engine is untouched and takes over immediately. No code revert is needed.
