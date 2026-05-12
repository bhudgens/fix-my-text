---
name: review
description: Review Fix My Text changes for workflow regressions, privacy risks, and public-release mistakes.
---

# Review Fix My Text

Review changes with a bias toward workflow regressions.

Focus on:

- Does cleanup preserve meaning, tone, sentiment, certainty, and facts?
- Does Copy use the hidden clean rewrite rather than visible diff markup?
- Is Insert enabled only for hotkey-originated rewrites with valid caller context?
- Are API keys, clipboard contents, and selected text kept out of logs?
- Does the compact UI avoid scrolling for the normal workflow?
- Do Electron IPC additions keep the preload bridge narrow?
- Do packaging changes avoid committing `dist/` or generated artifacts?

Suggested checks:

```bash
node --check main.js
node --check preload.js
node --check server.js
```
