# ADR 005: Build Desktop Artifacts in GitHub Actions

## Status

Accepted

## Context

The app needs deliverables for Linux, macOS, and Windows. Cross-platform Electron packages are best built on native runners, especially for macOS and Windows.

## Decision

Use `electron-builder` and a GitHub Actions matrix:

- Ubuntu builds Linux AppImage and deb artifacts.
- macOS builds dmg and zip artifacts.
- Windows builds exe artifacts.

Artifacts are uploaded to the workflow run rather than committed to git.

## Consequences

Build outputs stay attached to CI runs and do not bloat repository history.

Artifacts are unsigned until signing credentials are configured, so operating systems may show warnings.
