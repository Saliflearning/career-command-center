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
| 2026-09-20 | Kai (agent 3) | P0-1: verify the career summary before persisting it | `agents/orchestrator/index.ts` (Step 5, ~L595-620) | PR #13 opened (kai/p01-verify-summary); awaiting review |

## Completed

| Date | Agent | Task | Outcome |
|---|---|---|---|
| — | — | — | — |

## Notes

- P0-1 design spec (read-only, nothing modified): full insertion point, verifier input mapping, failure handling, retry caps, and complete code diff are documented separately.
- This file lives at the repo root as `AGENT_COORDINATION.md` so every agent finds it.
