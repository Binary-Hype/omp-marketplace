# OMP Marketplace Development Guide

This repository is OMP-specific. Keep it free of non-OMP runtime files, non-OMP hook configuration, plugin-bundled agents, and compatibility fallbacks.

## Layout

- `.claude-plugin/marketplace.json` is the marketplace catalog path used by OMP. Its content must remain OMP-specific and point at top-level plugin directories.
- `coding-assistant/package.json` contains package metadata plus the `omp.extensions` list.
- `coding-assistant/plugin.json` is the OMP plugin manifest.
- `coding-assistant/skills/**` contains shared skills with OMP tool names and OMP skill invocation wording.
- `coding-assistant/hooks/pre/core-safety.ts` is the OMP pre-tool-call safety extension.
- `coding-assistant/hooks/config/default-denylist.json` is loaded by the safety extension.
- `octo-pi/package.json` contains package metadata plus the `omp.extensions` list.
- `octo-pi/plugin.json` is the OMP plugin manifest.
- `octo-pi/src/**` contains the OMP command and tool extension runtime.
- `octo-pi/tests/**` contains the plugin behavior tests.
- `tests/**` contains marketplace-level Bats metadata tests that validate all cataloged plugins.

## Versioning

For a release, keep each plugin's versions identical across:

- `<plugin>/package.json`
- `<plugin>/plugin.json`
- `.claude-plugin/marketplace.json` plugin entry

Plugin versions are per-plugin; do not force unrelated plugins to share a version.

## Safety hook conventions

Use only OMP names and paths:

- `OMP_PLUGIN_ROOT`
- `OMP_SECURITY_CACHE_DIR`
- `~/.omp/agent/security`
- `.omp/security`

The hook handles OMP tool names: `read`, `edit`, `write`, `bash`, `search`, and `find`. Do not add compatibility branches for non-OMP tool names.

## Verification

From repository root, run:

```bash
bats tests
```

From `coding-assistant`, run:

```bash
bun test tests/test-core-safety.test.ts
```

From `octo-pi`, run:

```bash
bun install --frozen-lockfile # only if dependencies are missing
bun test
bun run typecheck
```
