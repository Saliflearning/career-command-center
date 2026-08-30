# ADR 0001: Publish with fresh history

**Status**: Accepted

## Context

The private development repository contains owner-specific evaluation material and internal coordination records. It also has active worktrees that must remain intact.

## Decision

Publish a sanitized current-tree snapshot as a new repository with fresh Git history. Keep the full development source private and do not rewrite it.

## Consequences

- Public history can be scanned exhaustively and safely.
- The private source remains the complete development record.
- Cross-agent handoffs must map both repositories explicitly.
