# ADR 001: Use Electron With a Local Express Proxy

## Status

Accepted

## Context

Fix My Text began as a web prototype and became a desktop utility with global hotkey capture, native clipboard integration, provider settings, and Insert back into the calling app. The existing prototype already had an Express server and a single-page UI.

## Decision

Wrap the existing web prototype in Electron, start the Express server from the Electron main process, and use the renderer for the compact UI.

Provider requests go through local Express routes instead of calling Anthropic, OpenAI, or Grok/xAI directly from the renderer. `/api/rewrite` handles rewrite requests, and `/api/models` handles model-list refreshes.

## Consequences

This keeps iteration fast and allows the app to reuse browser UI patterns while adding desktop capabilities in `main.js`.

The app still carries web and desktop concerns in a small number of files. Future refactors can split renderer assets, server code, and desktop integration into clearer modules if the current compact structure starts slowing development.
