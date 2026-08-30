# Portfolio Readiness

## Recruiter signal

This repository demonstrates a complete product boundary: authentication, persistence, AI orchestration, source-evidence controls, an editing workflow, export infrastructure, operational configuration, and automated verification.

## Evidence map

| Claim | Evidence |
|---|---|
| Stateful multi-agent pipeline | `agents/orchestrator/` and state transition tests |
| Persistent career memory | `prisma/schema.prisma` and mapping tests |
| Evidence-aware generation | verifier, source reconciliation, hallucination, and regression tests |
| Explainable public scan | `app/api/public/resume-scan/` and `components/marketing/PublicResumeScan.tsx` |
| Real editing workflow | `app/(app)/workspace/[resumeId]/` |
| Deterministic export | `lib/latex/` and `workers/latex-renderer/` |
| Privacy-safe public history | fresh-history release plus current/history safety gates |

## Release standard

The repository is ready to pin only when local verification, GitHub CI, CodeQL, repository security settings, fresh-clone verification, and desktop/mobile browser checks all pass on the same default-branch commit.

## Known limits

The application needs external services for full authenticated generation and PDF rendering. Scores are estimates, AI output requires human review, DOCX export remains disabled, and the public deployment is not a place for confidential data.
