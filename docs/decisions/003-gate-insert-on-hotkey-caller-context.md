# ADR 003: Gate Insert on Hotkey Caller Context

## Status

Accepted

## Context

Insert only makes sense when Fix My Text knows which app and selection triggered the rewrite. Manual text entry has no safe target for replacement.

## Decision

Enable Insert only when the current rewrite came from a hotkey handoff with a valid calling app. Manual text entry and manual edits clear the calling-app association and leave only Copy enabled.

On Linux/X11, the app remembers the active window at hotkey time and later uses clipboard paste into that window. On Windows, the app remembers the foreground Win32 window at hotkey time and later restores, activates, and pastes into that window. On macOS, the app remembers the frontmost application process at hotkey time and later activates it with AppleScript before pasting.

## Consequences

The UI avoids offering an action that cannot succeed. This also prevents stale caller context from being reused after the user edits text manually.

Insert remains platform-specific. Linux/X11, Windows, and macOS each have target-window/app capture plus paste paths, and each path should continue to be tested as a real desktop Electron app rather than through the standalone web server.
