# ADR 002: Show Inline Diff and Hide Clean Output

## Status

Accepted

## Context

The product should feel like accepting a tracked change, not comparing two documents. A separate clean-output panel made the popup larger and diluted the main review flow.

## Decision

Show only the inline diff. Keep the clean rewrite in renderer state and use it for Copy and Insert.

## Consequences

The UI stays smaller and the review target is clear.

Copy and Insert must always use the hidden clean rewrite rather than the visible diff DOM. Regressions here are easy to introduce, so changes to diff rendering should verify Copy and Insert behavior.
