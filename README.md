# Binary Hype OMP Marketplace

OMP-specific marketplace for Binary Hype coding-assistant plugins.

## Quick start

```bash
omp marketplace add Binary-Hype/omp-marketplace
omp install coding-assistant@binary-hype-omp
```

## Included plugin

### coding-assistant

A lean OMP coding assistant focused on code quality, security, and correctness.

Plugin surfaces:

- Skills invoked as `/skill:<name>`:
  - `/skill:api-design`
  - `/skill:commit-message`
  - `/skill:database-reviewer`
  - `/skill:dependency-auditor`
  - `/skill:grill-me`
  - `/skill:humanizer`
  - `/skill:merge-conflict-resolver`
  - `/skill:promote-prs`
  - `/skill:quality-check`
  - `/skill:test-generator`
- Pre-tool-call safety extension: `hooks/pre/core-safety.ts`

The safety hook blocks access to configured secret files, prevents commits with staged credential-looking content, blocks unsafe `op` CLI commands, and rejects `write` payloads larger than 800 lines.

## Safety configuration

The hook loads deny/allow patterns from:

- Global: `~/.omp/agent/security/denylist.json`
- Project: `.omp/security/denylist.json`

Each file may be either an array of deny patterns or an object with `deny` and `allow` arrays:

```json
{
  "deny": ["*.secret", "production.env"],
  "allow": [".env.example"]
}
```

Runtime cache overrides use `OMP_SECURITY_CACHE_DIR`; when unset, the hook uses `/tmp/omp-security-${uid}`.

## Repository metadata

Public source: <https://github.com/Binary-Hype/omp-marketplace>
