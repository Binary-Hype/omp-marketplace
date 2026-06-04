---
name: promote-prs
description: |
  Creates paired pull/merge requests for the current feature branch — one
  targeting develop (fallback main) labeled (production), and one targeting
  staging (fallback stage, then testing) labeled (staging). Auto-extracts
  JIRA ticket from the branch name and prompts only when missing. Idempotent:
  if a PR already exists for either source→target pair, it is left untouched
  and only missing PRs are created. Supports GitHub (gh) and GitLab (glab),
  auto-detected from the origin remote URL.
---

# Promote PRs

Open two pull/merge requests at once from the current feature branch — one to the production-bound branch (`develop`/`main`) and one to the staging branch (`staging`/`stage`/`testing`) — with a consistent JIRA-prefixed title and an idempotent re-run guarantee.

## When to Use This Skill

Use this skill when:
- The team uses a Git Flow–style model with parallel `develop` and `staging` long-lived branches
- A feature must ship to both branches simultaneously (production track + QA/staging track)
- You want to enforce a consistent PR title format like `[TIC-1337] <Title> (production|staging)`
- You want a re-runnable command that fills in missing PRs without disturbing existing ones

Do NOT use this skill when:
- The repo only has a single mainline branch — use plain `gh pr create` instead
- The feature should NOT go to staging (e.g. hotfix-only work)
- Staging requires cherry-picked commits rather than the full feature branch

## Title Format

```
[<JIRA-TICKET>] <Descriptive Title> (production)   ← targets develop / main
[<JIRA-TICKET>] <Descriptive Title> (staging)      ← targets staging / stage / testing
```

Examples:
- `[TIC-1337] Add Analytics Dashboard (production)`
- `[TIC_1337] Add Analytics Dashboard (staging)` (underscore preserved if branch uses it)
- `Fix Header Spacing (production)` (no ticket prefix when none can be detected and user skips)

The descriptive part is the same in both PRs; only the trailing `(production|staging)` differs.

## Workflow

When this skill is invoked, follow these steps in order. Stop and report cleanly on the first hard failure.

### Step 1: Detect Git Provider

```bash
git remote get-url origin
```

- URL contains `github.com` → use the **`gh`** CLI
- URL contains `gitlab` (covers `gitlab.com` and self-hosted instances) → use the **`glab`** CLI
- Otherwise → ask the user which provider to use, or abort if neither CLI is available

Verify the chosen CLI is installed and authenticated:

```bash
command -v gh && gh auth status        # GitHub
command -v glab && glab auth status    # GitLab
```

If the CLI is missing, abort with a clear install hint:
- GitHub: `brew install gh && gh auth login`
- GitLab: `brew install glab && glab auth login`

### Step 2: Resolve and Validate the Source Branch

```bash
git rev-parse --abbrev-ref HEAD
```

- If HEAD is one of `develop`, `main`, `staging`, `stage`, `testing` — **refuse**. These are protected target branches, never the source. Tell the user to switch to a feature branch and retry.
- Verify the branch is pushed:

```bash
git ls-remote --exit-code --heads origin "$BRANCH"
```

If the exit code is non-zero, the branch is not on the remote. Confirm with the user, then push:

```bash
git push -u origin "$BRANCH"
```

### Step 3: Resolve Target Branches with Fallback

Use `git ls-remote --exit-code --heads origin <branch>` to verify each candidate exists. Pick the first one that does.

| Slot | Try in order | Label |
|------|--------------|-------|
| Production | `develop` → `main` | `(production)` |
| Staging    | `staging` → `stage` → `testing` | `(staging)` |

If **no candidate exists** for either slot, abort with a clear message naming the missing branches. Do not partial-create — atomicity of intent matters here.

### Step 4: Extract the JIRA Ticket

Apply this regex to the source branch name (case-insensitive, first match wins):

```
([A-Z][A-Z0-9]+[-_]\d+)
```

- Matches `TIC-1337`, `TIC_1337`, `PROJ-42`, `ABC123-7`, etc.
- **Preserve the original separator** the user's branch used (`-` vs `_`).

Examples:
- `feat/TIC-1337-analytics` → `TIC-1337`
- `bugfix/TIC_42-typo` → `TIC_42`
- `refactor/cleanup` → no match → prompt

If no match is found, use **ask** with two options:
1. **Enter ticket manually** — user provides the prefix (e.g. `TIC-9999`)
2. **Skip — no ticket prefix** — title becomes `<Title> (production|staging)` with no `[TICKET]`

### Step 5: Build the Descriptive Title

Default derivation from the branch name:

1. Strip any leading folder prefix (`feat/`, `feature/`, `bugfix/`, `chore/`, `hotfix/`, etc.)
2. Strip the JIRA ticket and surrounding separators
3. Replace `-` and `_` with spaces
4. Title-case the result

Examples:
- `feat/TIC-1337-analytics-dashboard` → `Analytics Dashboard`
- `bugfix/TIC_42-fix-broken-header` → `Fix Broken Header`
- `chore/cleanup-old-tests` → `Cleanup Old Tests`

Show the proposed title to the user and accept an override before proceeding.

### Step 6: Build the PR Body

Generate the body once and reuse it for both PRs (only the title's trailing label differs).

```bash
git log <production-target>..<source> --oneline
```

Produce a body in this shape:

```markdown
## Summary
- <one bullet per significant commit, plain English>

## Test plan
- [ ] <test step 1>
- [ ] <test step 2>

## JIRA
<TICKET>   ← omit this section if no ticket
```

Keep summary bullets short — pull from commit subjects, rephrase imperative-mood verbs as needed.

### Step 7: Idempotency Check (BEFORE Creating Anything)

Query the provider for any **open** PR matching each (source, target) pair. Use the one-shot patterns below — they print the existing PR/MR URL or print nothing.

**GitHub** — `gh pr list` accepts `--head`, `--base`, `--state` (`open` is the default but explicit is fine), `--json`, and `--jq`. Verified against `gh pr list --help`. The PR URL field is `url`.

```bash
# Prints the existing PR URL, or nothing if no open PR matches
gh pr list \
  --head "$SOURCE" \
  --base "$TARGET" \
  --state open \
  --json url \
  --jq '.[0].url // empty'
```

**GitLab** — `glab mr list` does **not** have a `--state` flag. The default already returns only opened MRs (use `-c`/`--closed`, `-M`/`--merged`, or `-A`/`--all` to widen). Output format is selected with `-F`/`--output` (values: `text`, `json`). The MR URL field in the JSON is `web_url`, not `url`. Verified against `glab mr list --help`.

```bash
# Prints the existing MR URL, or nothing if no open MR matches
glab mr list \
  --source-branch "$SOURCE" \
  --target-branch "$TARGET" \
  --output json \
  | jq -r '.[0].web_url // empty'
```

Run the corresponding query once for `$PROD_TARGET` and once for `$STAGING_TARGET`. For each pair:
- **Output is non-empty** → a PR/MR already exists. Record its URL, mark as "kept existing", do not create.
- **Output is empty** → mark as "to create".

Possible outcomes (record which one applies for the final report):

| Production | Staging | Action |
|------------|---------|--------|
| Exists     | Exists  | Create nothing |
| Exists     | Missing | Create staging only |
| Missing    | Exists  | Create production only |
| Missing    | Missing | Create both |

### Step 8: Create the Missing PRs

Only run creation commands for slots marked "to create".

**GitHub:**
```bash
gh pr create \
  --base "$TARGET" \
  --head "$SOURCE" \
  --title "$TITLE" \
  --body "$(cat <<'EOF'
<body content>
EOF
)"
```

**GitLab:**
```bash
glab mr create \
  --target-branch "$TARGET" \
  --source-branch "$SOURCE" \
  --title "$TITLE" \
  --description "$(cat <<'EOF'
<body content>
EOF
)" \
  --yes
```

`--yes` skips the final submission confirmation prompt — without it, `glab mr create` hangs waiting for interactive input. Both `--title` and `--description` are supplied, so the editor does not open.

If creation of one PR fails:
- **Do not roll back** the other PR
- Report the error with the failing slot's name
- Tell the user the skill is safely re-runnable — fixing the issue and re-invoking will create only the still-missing PR

### Step 9: Report

Print one final summary:

```
Source:     feature/TIC-1337-analytics-dashboard
Provider:   GitHub

Production: [TIC-1337] Analytics Dashboard (production)
  Target:   develop
  PR:       https://github.com/org/repo/pull/42  (created)

Staging:    [TIC-1337] Analytics Dashboard (staging)
  Target:   staging
  PR:       https://github.com/org/repo/pull/43  (already existed, kept)
```

Always include both URLs — whether the PR was just created or pre-existing — so the user has both links in one place.

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| HEAD is `develop`, `main`, `staging`, `stage`, or `testing` | Refuse — these are targets, not sources |
| Source branch not pushed to remote | Confirm with user, then push |
| Neither `develop` nor `main` exists on remote | Abort, do not partial-create |
| Neither `staging` / `stage` / `testing` exists | Abort, do not partial-create |
| `gh` / `glab` not installed | Abort with install hint |
| `gh` / `glab` not authenticated | Abort with `gh auth login` / `glab auth login` hint |
| No JIRA ticket in branch name | Prompt via ask (manual entry or skip) |
| Branch name has multiple ticket-like patterns | Use the first match |
| Both PRs already open | Create nothing, report both URLs |
| One PR open, one missing | Create only the missing one |
| Self-hosted GitLab | Detected by `gitlab` substring in remote URL |

## Important Rules

1. **Idempotent first, creative second** — Always run the existence check before any creation. Never create a duplicate PR.
2. **Atomic preflight, non-atomic creation** — Validate everything (provider, branches, source) before any side effect. Once creation starts, treat each PR independently and never roll back.
3. **Preserve user formatting** — Whatever separator the JIRA ticket uses in the branch (`-` or `_`) must appear in the PR title. Do not normalize.
4. **Same body, different title suffix** — Both PRs share the same description; the only title difference is `(production)` vs `(staging)`.
5. **No destructive actions** — Never close, force-push, delete, or rename branches. Creation only.
6. **Confirm pushes** — If the source branch isn't on the remote, confirm with the user before pushing — don't push silently.
7. **Single source of truth** — Both PRs use the current feature branch as their source. No cherry-picking, no separate staging branch.
