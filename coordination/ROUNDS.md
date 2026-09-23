# Rounds — shared agent coordination

**This file is publication-safe by design and is mirrored in both repositories.**

Career Command Center is developed in a private source repository and released
through a separate public clean room with its own history. The two histories
are never merged. The detailed engineering log lives privately because it
contains owner-private context and cannot be published.

This file is the part all agents share. It is kept deliberately thin so it can
live in both places without ever carrying anything private.

## What may go in this file

Round number, agent, task name, repository, status, reviewer, verdict, and a
one-line reason. Nothing else.

## What may never go in this file

Owner identity or contact details, local filesystem paths, private repository
names, resume content or fixtures, credentials, or any excerpt from the private
engineering log. When a finding needs detail, it is recorded privately and this
file cites it by date only.

---

## The process

Each round: **split the work → each agent builds → peer review → agree or
disagree → approve → split again.**

### Review ring

Each agent reviews exactly one other, assigned by what they judge best:

| Reviews | Reviewer | Why |
|---|---|---|
| Codex's work | Claude | Verifying claims against the artifact |
| Kai's work | Codex | Adversarial review; runs the full gate |
| Claude's work | Kai | Is the output honest and useful to a candidate |

Any agent may request a second reviewer on unusually risky work — by exception,
not by default.

### The evidence standard

To **block** a round, an objection must name a concrete failure: the input, the
wrong behaviour that results, and where. "I would have done this differently"
is a comment, not a block, and is logged as a note while the round proceeds.

If author and reviewer still disagree after one exchange, the owner decides.
Neither agent reopens it in a later round.

### What CI covers, and what review covers

Once CI runs on push, tests, typecheck, lint, build and audit are the
pipeline's job. Peer review is for judgement only. A reviewer who spends the
round confirming the build is green has spent it badly.

Until CI exists, one agent is the mechanical gate for everyone, which is the
bottleneck this process exists to remove.

### Definition of approved

A round closes when, for every item: the author has logged what they built, the
assigned reviewer has logged approve or a blocking objection meeting the
evidence standard, and every blocking objection is resolved.

---

## Round 1 — in progress

| Agent | Task | Repo | Status | Reviewer | Verdict |
|---|---|---|---|---|---|
| Codex | Full gate on the font/metrics slice; verifier "US" false positive | private | in progress | Claude | — |
| Kai | P0-1 summary verification, landed where the product ships | private target | PR open on public; rework for Codex items 1-2 pushed 2026-09-23 | Codex | changes required, 3 items (2026-09-23) |
| Claude | P0-2 deterministic ATS checklist wired into the export path | private | done — private PR #4, 7 deterministic checks, diagnostic only | Kai | — |

**Not in round 1, deliberately:** typography polish. Not launch-blocking; waits
until the three trust items are through.

**Renderer-contract question (was blocking Claude's item):** answered by Claude
2026-09-23 — the PDF builder may return drawn section labels, date strings and
contact values as an additive result field; backward compatible; recorded for
Codex's objection on private PR #4.

**CI vs local:** the latest private-repo CI run is not green — Jest fails under
the workflow Node 20 runtime. Local suite results (e.g. 931/931) are recorded
separately and are not CI runs.

---

## Completed rounds

*(none yet)*

---

*Mirror discipline: whoever can push to a repository updates this file there in
the same session they update the other. If the two copies disagree, the
private copy is authoritative.*
