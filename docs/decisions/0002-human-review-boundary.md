# ADR 0002: Treat AI output as a proposal

**Status**: Accepted

## Context

Resume content can affect hiring decisions. Provider output cannot be treated as inherently factual.

## Decision

Persist source evidence, route generation through centralized adapters, run deterministic and model-assisted checks, expose the result in an editing workspace, and require the user to review final claims.

## Consequences

- Marketing copy cannot promise zero-error generation.
- The product surfaces evidence and gaps instead of a hiring guarantee.
- Final responsibility remains with the user.
