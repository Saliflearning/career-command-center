# Resume renderer rebuild — handoff

**Branch:** `feat/resume-render-engine` · **Started by:** Claude (Opus 4.8), 2026-11-09
**Reversible by design:** new engine is flag-gated and defaults OFF; the legacy
renderer is untouched; everything is on this branch, nothing deploys until `main`.

## Why
`lib/export/structured-resume-pdf.ts` is a hand-written raw-PDF byte emitter. It
*estimates* glyph width as `length * size * 0.49`, so wrapping and one-page fit
are fragile and the output looks generic. The blocker to launch is the render
quality. We swap it for a template engine (`@react-pdf/renderer`) that measures
text with real font metrics and supports full Unicode and real design.

## Done so far (this branch)
- `lib/export/react-pdf-resume.ts` — `renderStructuredResumePdfReactPdf(input)`
  (async). Same contract as `buildStructuredResumePdf`:
  `StructuredResumeExportInput -> StructuredResumePdfResult`, one-page guarantee
  via a density ladder, throws the same `StructuredResumeOverflowError` /
  `StructuredResumeContentError` the callers already handle. Reuses the existing
  types, error classes, and `lib/resume/date-format` helpers. Section order and
  skills-title-by-role match the legacy renderer. Premium look (navy accent,
  serif name, letter-spaced labels, aligned dates).
- `lib/export/react-pdf-resume.test.ts` — 2 tests (valid 1-page PDF; rejects
  missing name). `tsc --noEmit` clean. Writes a preview PDF to the OS temp dir.
- **Not wired into the pipeline.** Legacy sync `buildStructuredResumePdf` is the
  instant fallback.

## Remaining (pick up here)
1. **Fonts:** embed Source Serif 4 (name/headings) + Source Sans 3 (body/labels)
   via `Font.register` with TTFs committed under `assets/fonts/`. Register once at
   module load. (Currently Times/Helvetica built-ins.)
2. **Dispatcher + flag + async callers:** add an async entry (e.g.
   `renderResumePdf(input)`) that selects engine by `process.env.RESUME_RENDER_ENGINE`
   (`"canvas"` default, `"react-pdf"` opt-in). Make the 4 callers `await` it:
   `lib/export/structured-resume-input.ts`, `lib/resume/visual-quality-gate.ts`,
   `app/api/export/[id]/route.ts`, `agents/visual-qa/index.ts`.
3. **Parity + tests:** overflow/density tests, projects + education-details +
   cert-label coverage, and a pixel/structure check against the legacy output.
4. **Deploy check:** confirm `@react-pdf/renderer` (yoga-layout wasm) runs on the
   Vercel Node runtime, then flip the flag in a preview deploy before production.
5. Optional: a 2nd/3rd template choice.

## Guardrails
- Keep the legacy renderer until the new one is proven in a preview deploy.
- Flag defaults to `canvas`; flipping it is the only production behavior change,
  and it reverts instantly.
