# Security

## API Keys

Fix My Text accepts Anthropic, OpenAI, or Grok/xAI API keys in the local UI and sends rewrite requests through the local Express server running inside the app. Do not commit API keys, local config, logs, or captured user text.

API keys entered in the UI are stored locally in the Electron renderer's `localStorage` under provider-specific settings. The server can also read provider keys from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `XAI_API_KEY`. These values should stay on the user's machine and must not be checked into source control, attached to issues, or included in diagnostic logs.

## Sensitive Text

This tool sends selected text to the configured AI provider. Treat highlighted text as user data and avoid adding logging that records source text, rewritten text, API keys, provider responses, or clipboard contents.

## Reporting Issues

Report security concerns privately to the repository owner. If this repository is moved to a public project, add the preferred private contact method here.

## Current Limitations

- macOS selection capture and Insert rely on Accessibility-permitted AppleScript keystrokes.
- Windows Insert is not implemented.
- Linux Insert currently relies on X11 window activation and clipboard paste behavior.
- Release artifacts are unsigned unless signing credentials are configured.
