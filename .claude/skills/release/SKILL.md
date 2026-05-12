---
name: release
description: Prepare Fix My Text packaged release artifacts and verify public release metadata.
---

# Build and Release

Use this when preparing packaged artifacts.

Checklist:

- Confirm `package.json` version and product metadata.
- Confirm `package-lock.json` is committed after dependency changes.
- Run syntax checks for edited JavaScript files.
- Use Node.js 22 for packaging parity with GitHub Actions.
- Trigger the `Build desktop artifacts` workflow or push a release tag.
- Download artifacts from the workflow summary or GitHub Release.
- Note that packages are unsigned unless signing credentials are configured.

Local build commands:

```bash
npm run build:linux
npm run build:mac
npm run build:win
```
