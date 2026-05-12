# VISION

## Product Beacon

Fix My Text should feel like a quiet desktop layer for improving writing anywhere. You highlight text in the app you are already using, press a global hotkey, review a clear inline diff, and accept the rewrite back into the original context without losing your place.

The final product is not a chat app, a document editor, or a browser workflow. It is a small OS-level writing utility that makes cleanup feel like accepting a tracked change.

## Current Shape

The current app already implements the core product loop:

1. Select text in another app.
2. Press a registered global hotkey.
3. Fix My Text captures the selected text and opens a compact Electron popup.
4. The app rewrites the text through the configured AI provider.
5. The user reviews a tracked-changes-style inline diff.
6. The user copies the clean rewrite or inserts it back into the calling app when the platform supports Insert.

The app is feature complete enough to prove the product: global trigger, selected-text capture, provider configuration, conservative cleanup, model selection, inline diff review, Copy, Insert gating, compact window behavior, macOS menu bar behavior, and desktop artifact builds are all in place.

## Final Product

Fix My Text should eventually be a dependable cross-platform utility with the same basic workflow on macOS, Linux, and Windows:

- Global hotkey capture from any editable context where the OS allows it.
- Conservative cleanup that preserves meaning, facts, sentiment, tone, certainty, formatting, and emphasis.
- Transparent inline diff review instead of a black-box replacement.
- A clean Copy fallback for every platform.
- A reliable Insert action wherever the app can safely identify and reactivate the calling app.
- Local provider settings for Anthropic, OpenAI, and Grok/xAI.
- Minimal background presence through a tray or menu bar item.
- Signed, installable release artifacts.

Platform support can mature unevenly without changing the product direction. The app is allowed to be more complete on one OS before another, as long as the supported behavior is clear and the core loop stays the same.

## Product Principles

### 1. Preserve Meaning

The rewrite should improve clarity, grammar, punctuation, word choice, and presentation without changing what the user meant. When the model would need to guess, it should leave the text alone.

### 2. Show The Edit

The visible output should be the inline diff. The clean rewritten text should remain available behind the scenes for Copy and Insert, but the review moment should focus on what changed.

### 3. Stay Compact

The UI should feel like a utility popup, not a writing workspace. Source text, diff, Copy, Insert, provider settings, and hotkey settings are the important surfaces.

### 4. Finish The Loop

Copy is a fallback. The best version of the product returns the cleaned text to the original app with one intentional Insert action.

### 5. Keep Trust Visible

The app should be explicit about provider choice, model choice, local API key storage, platform limits, and unsigned builds until signing is configured.

## Scope

In scope:

- Global hotkey configuration.
- Selected-text capture.
- Conservative cleanup mode.
- Provider and model selection.
- Inline tracked-changes diff.
- Copy clean rewrite.
- Insert clean rewrite when caller context is valid.
- Tray or menu bar background behavior.
- Platform artifacts through CI.

Future scope:

- Windows Insert support.
- Code signing and notarization.
- Better first-run onboarding for permissions.
- More reliable model discovery and provider error messages.
- Optional rewrite modes only if they preserve the compact workflow.

Out of scope:

- Browser extension.
- Mobile app.
- Multi-user accounts.
- Document history.
- Freeform chat.
- Logging selected text or provider responses.

## Quality Bar

A good rewrite reads naturally and keeps the writer's intent intact. It can smooth awkward structure and combine choppy adjacent sentences when the meaning is clear. It should not add ideas, remove meaningful nuance, intensify claims, soften sentiment, flatten deliberate voice, or produce generic marketing language.

The product succeeds when selecting, rewriting, reviewing, and inserting text feels faster than switching to any other tool.
