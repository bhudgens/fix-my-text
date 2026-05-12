# Contributing

Fix My Text is still moving quickly, so contributions should favor small, inspectable changes over broad rewrites.

## Development Setup

```bash
npm ci
npm start
```

Use Node.js 22 when possible so local packaging matches GitHub Actions.

## Before Changing Code

- Read `CLAUDE.md` for repo-specific constraints.
- Read `docs/architecture.md` before changing hotkey capture, insertion, prompt behavior, or packaging.
- Check the relevant ADR in `docs/decisions/` before reversing a product or architecture choice.

## Verification

There is no formal test suite yet. At minimum, run syntax checks for edited JavaScript files:

```bash
node --check main.js
node --check preload.js
node --check server.js
```

For workflow-sensitive changes, verify manually:

- Manual text entry enables Copy but keeps Insert disabled.
- Hotkey handoff captures selected text and auto-runs cleanup.
- Insert only enables for hotkey-originated rewrites with a valid calling app.
- Copy and Insert use the clean rewrite, not the visible diff text.
- The Electron window stays compact and resizes to content.

## Pull Requests

- Keep PRs focused on one behavior or documentation area.
- Include screenshots or short notes for visible UI changes.
- Call out platform-specific behavior, especially Linux/X11, Windows, and macOS gaps.
- Do not include API keys, local config, `node_modules/`, `dist/`, or packaged artifacts.

## Release Builds

GitHub Actions creates platform artifacts from `.github/workflows/build-desktop.yml`. The outputs are unsigned by default. Configure signing separately before treating builds as end-user releases.
