# Fix My Text

## Purpose
Fix My Text is an Electron desktop utility for conservatively cleaning up selected text with AI. The core workflow is: capture highlighted text from another app, show an inline tracked-changes diff, then copy or insert the clean rewrite without changing meaning.

## Repo Map
- `index.html` - compact renderer UI, hotkey config controls, diff rendering, Copy/Insert actions.
- `main.js` - Electron main process, Express startup, global hotkey registration, selection capture, insertion back to calling apps, window sizing.
- `preload.js` - safe IPC bridge between renderer and Electron main process.
- `server.js` - Express static server and `/api/rewrite` plus `/api/models` proxy for Anthropic, OpenAI, and Grok/xAI.
- `.github/workflows/` - platform artifact builds with GitHub Actions.
- `docs/` - architecture notes and ADRs.

## Rules & Commands
- Preserve the cleanup contract: improve clarity and presentation without changing facts, tone, sentiment, certainty, or meaning.
- Keep the UI compact; the text box, diff, Copy, and Insert are the primary workflow.
- Only enable Insert when the current rewrite came from a hotkey handoff with a valid calling app.
- Do not commit API keys, build artifacts, `node_modules/`, or `dist/`.
- Use Node.js 22 for CI/build parity.
- Run syntax checks after JS edits: `node --check main.js`, `node --check preload.js`, `node --check server.js`.
- Run locally with `npm start`. On Linux, if Electron aborts with a `chrome-sandbox` ownership/mode error, rerun as `npx electron . --no-sandbox`; use `npm run serve` only for the standalone Express server.
- Package with `npm run build`, `npm run build:linux`, `npm run build:mac`, or `npm run build:win`.
