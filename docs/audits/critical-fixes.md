# Critical Tauri security fixes

## Summary

Hardened the packaged Tauri security configuration by separating development-only CSP allowances from the production CSP and by explicitly pinning the enabled capability set.

## What changed

- Added `app.security.devCsp` in `src-tauri/tauri.conf.json` and moved the broad localhost and loopback wildcard allowances there.
- Tightened the packaged `app.security.csp` to the loopback endpoints that are actually referenced by current runtime code:
  - `http://127.0.0.1:4096`
  - `ws://127.0.0.1:4097`
  - `http://localhost:3000`
  - `ws://localhost:3000`
- Added `app.security.capabilities: ["default"]` so Tauri no longer auto-enables every capability file placed under `src-tauri/capabilities/`.

## Why this matters

Before this change, the app used one shared CSP for both development and packaged builds. That policy allowed broad connections to arbitrary `localhost` and `127.0.0.1` HTTP, WS, and WSS endpoints. In practice, that meant permissive dev allowances could ship in production.

Pinning capabilities closes a separate footgun: Tauri auto-loads all capability files in `src-tauri/capabilities` unless the config explicitly names which ones should be enabled. Restricting the app to the existing `default` capability prevents accidental privilege expansion if a future capability file is added.

## Scope notes

- `src-tauri/capabilities/default.json` was intentionally left unchanged in this fix. Its current shell and plugin permissions are actively referenced by the application, so the root fix here was to narrow exposure through config rather than remove permissions without a feature-by-feature audit.
- This change only addresses the highest-priority Tauri config hardening issue. It does not refactor collaboration, preview, or notebook transport design.

## Validation

- Parse `src-tauri/tauri.conf.json` as JSON.
- Run `cargo check` in `src-tauri` to confirm Tauri accepts the updated config and capability selection.
- Review the diff to confirm the change is limited to the Tauri config and this audit note.