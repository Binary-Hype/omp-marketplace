---
name: merge-conflict-resolver
description: Analyzes git merge conflicts and recommends resolutions by examining both sides of each conflict, gathering branch context, and providing per-conflict recommendations with risk levels. Helps resolve conflicts from merges, rebases, and cherry-picks with confidence.
---

# Merge Conflict Resolver

This skill analyzes active git merge conflicts and recommends the best resolution for each conflict, explaining the reasoning behind every recommendation so you can resolve conflicts with confidence.

## When to Use This Skill

- After `git merge` produces conflicts
- After `git rebase` stops on a conflicting commit
- After `git cherry-pick` encounters conflicts
- When you have unresolved merge conflicts and need guidance
- When conflicts span multiple files and you need a systematic approach

## What This Skill Does

1. **Detects Conflicted Files**: Runs `git diff --name-only --diff-filter=U` to find all files with unresolved conflicts
2. **Categorizes Files**: Groups conflicted files by type to apply appropriate resolution strategies
3. **Parses Conflict Markers**: Reads each file and extracts `<<<<<<<`, `=======`, `>>>>>>>` conflict blocks
4. **Gathers Branch Context**: Uses `git log` to understand what each branch was trying to accomplish
5. **Recommends Resolutions**: Provides a specific recommendation per conflict with reasoning and risk assessment

## How to Use

### Basic Usage

From a repository with active merge conflicts:

```
Analyze my merge conflicts and recommend resolutions
```

```
Help me resolve these rebase conflicts
```

### For Specific Files

```
Analyze the merge conflict in src/Controllers/UserController.php
```

### After a Failed Merge

```
I just ran git merge feature/auth and got conflicts. What should I do?
```

## Special Case Handling

| File Type | Examples | Recommended Strategy |
|---|---|---|
| Lock files | `composer.lock`, `package-lock.json`, `yarn.lock` | Discard both sides, regenerate by running the package manager |
| Migrations | Database migrations with timestamps | Keep both migrations, adjust timestamps to maintain ordering |
| Config files | `.env.example`, `config/*.php`, `webpack.config.js` | Careful manual review — both sides likely added needed values |
| Auto-generated files | `openapi.json`, compiled assets, IDE configs | Regenerate from source after resolving source conflicts |
| Source code | `.php`, `.js`, `.ts`, `.py` | Analyze intent of both changes and merge logically |

## Output Format

For each conflicted file, the analysis includes:

### Per-Conflict Analysis

- **File**: Path to the conflicted file
- **Conflict location**: Line numbers and surrounding context
- **"Ours" explanation**: What the current branch changed and why
- **"Theirs" explanation**: What the incoming branch changed and why
- **Recommendation**: One of:
  - **Keep Ours** — the current branch's version is correct
  - **Keep Theirs** — the incoming branch's version is correct
  - **Merge Both** — combine changes from both sides
  - **Custom** — neither side is fully correct, a new version is needed
- **Risk level**: Low / Medium / High
- **Reasoning**: Why this recommendation was made
- **Suggested code**: The recommended merged result (when applicable)

### Summary Table

After all conflicts are analyzed, a summary table shows:

```
| File | Conflicts | Recommendation | Risk |
|---|---|---|---|
| src/UserController.php | 2 | Merge Both | Medium |
| config/app.php | 1 | Keep Theirs | Low |
| composer.lock | 1 | Regenerate | Low |
```

## Example

**User**: "I merged main into my feature branch and got conflicts"

**Output**:

```
## Merge Conflict Analysis

Branch: feature/notifications ← main
Total conflicted files: 3 (5 conflict blocks)

### 1. src/Services/NotificationService.php

**Conflict 1** (lines 45-62)

- **Ours** (feature/notifications): Added email notification channel
  with template support
- **Theirs** (main): Refactored notification dispatch to use queued jobs

- **Recommendation**: Merge Both
- **Risk**: Medium — both changes affect the dispatch method
- **Reasoning**: The email channel addition is independent of the
  queue refactor. Combine by adding the email channel within the
  new queued job structure.
- **Suggested code**:
  [merged version shown here]

---

### Summary

| File | Conflicts | Recommendation | Risk |
|---|---|---|---|
| src/Services/NotificationService.php | 2 | Merge Both | Medium |
| config/notifications.php | 1 | Keep Theirs | Low |
| composer.lock | 1 | Regenerate | Low |

**Next steps**: Apply the recommendations, then run your test suite
to verify the resolutions are correct.
```

## Tips

- Run this skill from your repository root so all conflicted files are found
- Resolve source code conflicts before regenerating lock files
- After applying recommendations, always run your test suite to verify
- For complex conflicts marked "High" risk, review the suggested code carefully before applying
- Use `git log --oneline --graph main..HEAD` to understand divergence before resolving

## Related Use Cases

- Post-merge verification and cleanup
- Understanding what changed on both branches before resolving
- Training team members on conflict resolution strategies
- Documenting resolution decisions for complex merges
