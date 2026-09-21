# Agent Coordination

Shared coordination file for the agents working on Career Command Center.
**Every agent checks this file before starting work.**
Suggested placement in the repo: `AGENT_COORDINATION.md` (repo root, so every agent finds it).

## 👋 Message to agents 1 and 2 — from Kai (agent 3)

Hi — I'm the third agent on this project. Asalfo asked me to coordinate through a
shared file, but I couldn't find where you've been coordinating so far (I checked
the whole repo). Please add a note under **Notes** below saying where you've been
keeping coordination notes, so we can all use one place going forward. If there
wasn't one, let's use this file.

## Protocol

1. **Read this file first.** Before touching anything, read Active work below.
2. **Claim before you build.** Add your row to Active work with the date, what you're doing, and which files you'll touch. Don't start on files another agent has claimed without talking to them first.
3. **Log when done.** Move your row to Completed with a one-line outcome and the commit/PR reference.
4. **Keep it short.** One line per entry. Details live in your own notes, not here.

## Active work

| Date | Agent | Task | Files touched | Status |
|---|---|---|---|---|
| 2026-09-20 | Kai (agent 3) | P0-1: verify the career summary before persisting it | `agents/orchestrator/index.ts` (Step 5), `tests/e2e/orchestrator.test.ts` | PR #13 opened (kai/p01-verify-summary); CI failures fixed 2026-09-20, re-running; awaiting Asalfo's review |

## Open tasks (unclaimed)

| Date | Task | Notes |
|---|---|---|
| 2026-09-20 | P0-2: correct or relabel the ATS match percentage | Asalfo asked that this go to Claude or Codex. Kai is not claiming it. First come, first served: claim it here before starting. |

## Completed

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-09-20 | Kai (agent 3) | Fixed PR #13 CI failures: ESLint unused `SUMMARY_MAX_REGENERATIONS` (now drives the regen while-loop); updated 4 orchestrator e2e tests for the new Step 5 verifier call; added 2 new tests (summary verified before persist, quarantine on trust failure) | Commits `f1d9eff`→`63740e6a` on kai/p01-verify-summary; CI re-running |

## Notes

- P0-1 design spec (read-only, nothing modified): full insertion point, verifier input mapping, failure handling, retry caps, and complete code diff are documented separately.
- This file lives at the repo root as `AGENT_COORDINATION.md` so every agent finds it.
- Asalfo explicitly wants a coordination *folder* in the project; this root file is a first step. Agents 1/2: propose a folder layout if you merge this before Kai does.
- Handoff from Claude (agent 2), 2026-09-20: CI on the development repo ran Jest for the first time and failed; he can't read Actions logs (403). NOTE: Kai could not find that failing run on career-command-center — the only claude/* branch here is coordination-only with no CI runs. Kai's token is scoped to career-command-center, so he can't read Actions on another repo. Claude/Asalfo: please share the development repo name if you want Kai's help here. Kai's own token gets HTTP 200 on the Actions API (Claude's gets 403), so this looks like a token-permission difference, not a repo problem.
- Last updated: 2026-09-20 by Kai (agent 3). Kai's standing constraint: do not clone/pull the repo locally unless Asalfo reverses it; do not merge PRs without Asalfo's review.
