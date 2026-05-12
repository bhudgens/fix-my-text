# Fix My Text

Fix My Text is a cross-platform desktop utility for polishing selected writing without changing what the writer meant. Highlight text in any app, press a global hotkey, review a tracked-changes-style diff, then copy or insert the cleaned-up version back into the original app.

The app is built for a narrow, practical workflow: make text clearer, smoother, and more presentable while preserving facts, tone, sentiment, certainty, and intent.

## Releases

Download the latest Linux, macOS, and Windows builds from the [GitHub Releases page](https://github.com/bhudgens/fix-my-text/releases).

Release builds are the recommended way to try the app. Development runs are for local testing with Electron and Node.js.

## Features

- Global hotkey capture from other desktop apps
- Conservative AI cleanup through Anthropic, OpenAI, or Grok/xAI
- Provider, API key, and model selection with model refresh
- Inline word-level diff with removed and added text highlighted
- Copy clean rewrite without showing a separate plain-text panel
- Insert clean rewrite back into the calling app when a valid caller exists
- Compact Electron window that resizes to the UI content
- macOS menu bar app behavior with Open, Settings, and Quit
- Windows-specific taskbar and tray icons for native desktop use
- GitHub Actions builds for Linux, macOS, and Windows artifacts

## Current Platform Support

| Area | Linux | Windows | macOS |
| --- | --- | --- | --- |
| Electron app | Yes | Yes | Yes |
| Global hotkey registration | Yes | Yes | Yes |
| Selection capture | X11 primary selection or clipboard fallback | SendKeys clipboard fallback | AppleScript clipboard fallback |
| Insert back into calling app | X11 window activation + paste | Win32 foreground-window activation + paste | AppleScript app activation + paste |
| Background tray/menu bar | Tray where supported | Windows tray icon | Menu bar item |
| CI packaging | AppImage, deb | nsis, portable exe | dmg, zip |

## Requirements

- Node.js 22 for packaging and CI parity
- npm
- API key for Anthropic, OpenAI, or Grok/xAI
- Optional API key environment variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `XAI_API_KEY`
- Linux/X11 for the current end-to-end global hotkey and Insert workflow
- macOS Accessibility permission for the app when using global hotkey capture or Insert
- Windows supports the end-to-end desktop flow with global hotkey capture, rewrite, and Insert back into the calling window. Windows can still block paste into elevated/admin apps or secure desktop prompts unless Fix My Text runs at the same integrity level.

## Installation

### Linux / Windows

- Download the latest release asset for your OS from [GitHub Releases](https://github.com/bhudgens/fix-my-text/releases) and follow the installer/package flow for that platform.

### macOS (Important)

**Important:** This app is unsigned in current public builds. On macOS, you must trust/unblock the bundle before first launch.

1. Install from the `.dmg` (drag `Fix My Text.app` to `/Applications`).
2. Run these commands in Terminal **as your normal user**:

```bash
xattr -dr com.apple.quarantine "/Applications/Fix My Text.app"
```

3. Verify the quarantine flag is removed:

```bash
xattr -p com.apple.quarantine "/Applications/Fix My Text.app" 2>/dev/null || echo "quarantine flag cleared"
```

4. Launch once:

```bash
open -a "/Applications/Fix My Text.app"
```

If macOS still shows a gate prompt, use the first-launch path in **System Settings → Privacy & Security → Security** to allow opening from the unidentified developer option.

`spctl --assess` may still report `rejected` for unsigned apps; the app should still be launchable after the quarantine flag is removed and manual allow is accepted.

## Quick Start

```bash
npm ci
npm start
```

Open Settings in the app, choose a provider, enter an API key, refresh or select a model, and register a hotkey. Then highlight text in another app and press the hotkey.

After a hotkey and API key are configured, the desktop app can start in the background. On macOS, it runs as a menu bar app; click the menu bar icon for Open, Settings, or Quit. Closing the window hides it instead of quitting.

On Windows, the development app should be tested as the Electron desktop process, not the standalone web server or browser preview. The tray entry uses Windows-specific tray PNG assets, while the taskbar/window icon uses the Windows-specific app icon with a rounded off-white backdrop.

## Development

```bash
npm start
npm run serve
npm run build
npm run build:linux
npm run build:mac
npm run build:win
```

Useful lightweight checks:

```bash
node --check main.js
node --check preload.js
node --check server.js
```

There is not yet a formal test suite. Keep changes small and verify the user workflow directly when touching hotkey capture, clipboard behavior, insertion, or prompt output.

## Architecture

The app has three main pieces:

- `index.html` is the renderer UI and client-side inline diff renderer.
- `server.js` serves static files and proxies `/api/rewrite` and `/api/models` calls to the selected AI provider.
- `main.js` starts the Express server inside Electron, owns global hotkeys, captures selected text, and performs Insert back into the calling app.

See [docs/architecture.md](docs/architecture.md) for the fuller system overview.

## Builds

GitHub Actions builds platform packages on native runners:

- Linux: `.AppImage`, `.deb`
- macOS: `.dmg`, `.zip`
- Windows: `.exe`

Tagged release builds upload their packages directly to GitHub Releases. Pull request and manual non-release builds may upload short-lived Actions artifacts for inspection.

Builds are unsigned by default, so operating systems may warn users until signing is configured.

Pushing a `v*` tag creates or updates the matching GitHub Release and attaches the built desktop packages.

## Documentation

- [Architecture](docs/architecture.md)
- [Architecture decisions](docs/decisions/)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

ISC. See [LICENSE](LICENSE).
