# ADR 004: Use a Conservative Cleanup Prompt

## Status

Accepted

## Context

The tool should improve writing without changing meaning. Early cleanup behavior fixed spelling and grammar but did not always improve choppy presentation. The product needs a middle ground: polished and readable, but not stylistically rewritten.

## Decision

Use a cleanup prompt that explicitly performs two passes:

- Fix grammar, spelling, punctuation, and word choice.
- Improve presentation by smoothing awkward flow, wordiness, clunky sentence structure, and choppy adjacent sentences.

The prompt also explicitly forbids changing facts, ideas, sentiment, relationships, caveats, certainty, emphasis, or context.

## Consequences

The model has permission to make communication more natural and pleasant to read, including light sentence combination when the meaning is clear.

The prompt must continue to prefer leaving wording alone over guessing or making dramatic changes.
