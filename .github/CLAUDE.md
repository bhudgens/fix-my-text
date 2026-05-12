# GitHub Workflows

## Purpose
This directory contains CI workflows for building desktop artifacts.

## Constraints
- Use native runners for platform packages: Ubuntu for Linux, macOS for macOS, Windows for Windows.
- Keep artifacts uploaded to workflow runs; do not commit `dist/` outputs.
- Use Node.js 22 for `electron-builder` compatibility.
- Keep `CSC_IDENTITY_AUTO_DISCOVERY=false` unless signing is intentionally configured.
