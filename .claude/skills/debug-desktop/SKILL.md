---
name: debug-desktop
description: Diagnose Fix My Text desktop integration failures such as hotkey capture, selected-text loading, Insert, or window sizing.
---

# Debug Desktop Integration

Use this when hotkey capture, selected-text loading, Insert, or window sizing misbehaves.

Start by identifying which leg is failing:

- Hotkey registration: saved accelerator, Electron `globalShortcut`, platform support.
- Selection capture: primary selection, clipboard-copy fallback, SendKeys fallback.
- Rewrite: `/api/rewrite`, provider response parsing, prompt behavior.
- Insert: caller context, clipboard contents, target-window activation, paste event.
- Window sizing: renderer `ResizeObserver`, `resizeToContent` IPC, Electron bounds clamp.

Do not assume Copy and Insert share the same failure mode. Copy is renderer clipboard behavior; Insert is renderer clipboard plus Electron caller activation and paste.

Suggested checks:

```bash
node --check main.js
node --check preload.js
node --check server.js
npm start
```
