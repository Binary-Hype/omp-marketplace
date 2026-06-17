---
name: quality-check
description: Quality screen for code changes covering design pattern appropriateness, readability, SOLID/DRY principles, common performance anti-patterns, and dead code. Defaults to scanning unstaged git changes; accepts explicit file paths or diff ranges as alternative scope. Not a full performance audit and not a full-codebase dead-code pipeline — focuses on well-known anti-patterns visible in the diff.
---

# Quality Check

A fast, opinionated quality screen for code changes. Run it mid-work — before a commit or before opening a PR — to get a focused readout across five dimensions: design-pattern appropriateness, readability, SOLID & DRY, common performance anti-patterns, and dead code. The skill defaults to scanning your unstaged git diff so invocation is cheap. It stays narrow on purpose: this is not a full performance audit, not a security review, not an accessibility review, and not a codebase-wide dead-code pipeline. When in doubt, this skill prefers **readable code over micro-optimization** and only flags performance issues that are well-known anti-patterns.

## When to Use This Skill

Use this skill when:
- You just finished a chunk of work and want a quality readout before staging
- You're about to open a PR and want a self-review pass
- A function or class is starting to feel "off" and you want a second opinion
- You introduced a design pattern and want a sanity check that it fits
- You suspect a loop or query you wrote is a common anti-pattern
- A reviewer asked "is this readable?" and you want concrete signals to check
- You're learning SOLID/DRY and want feedback grounded in your actual code

For framework-deep review, defer to `code-review-laravel` or `code-review-shopware`. For security, defer to `security-scanner`.

## Default Scope: Unstaged Git Changes

By default this skill scans your **unstaged** working-tree changes. No argument needed.

```bash
# Default scope — what changed but isn't staged yet
git diff --stat
git diff
git diff --name-only
```

If `git diff` is empty (nothing unstaged), report that clearly and offer fallbacks rather than silently doing nothing.

**Fallback / override scopes** the user can pass:

| Invocation | Scope |
| --- | --- |
| `/skill:quality-check` | Unstaged working-tree changes (default) |
| `/skill:quality-check staged` | Staged changes (`git diff --staged`) |
| `/skill:quality-check all` | Unstaged + staged combined |
| `/skill:quality-check main..HEAD` | A diff range |
| `/skill:quality-check app/Services/Foo.php` | One or more specific files or directories |

When scanning a diff, read the surrounding context of each changed file (not just the hunk). Diffs alone hide too much to judge patterns, SOLID, or readability.

## Review Dimensions

### 1. Design Pattern Appropriateness

Flag patterns that are misused, missing where they would obviously help, or used where they add complexity without benefit. Patterns to watch:

- **Strategy** — *helps* when you have multiple interchangeable algorithms selected at runtime. *Hurts* when there's only one implementation and the abstraction is speculative.
- **Factory** — *helps* when object construction is non-trivial, has conditional branches, or needs to be swapped. *Hurts* when it just wraps a single `new Foo()` call.
- **Singleton** — frequently misused. *Helps* for genuinely process-global resources. *Hurts* when used as a "shortcut to globals" — flag global mutable state, hidden coupling, and untestable code.
- **Observer / Pub-Sub** — *helps* for decoupled event-driven flows. *Hurts* when caller and listener live in the same module and a direct call would be clearer.
- **Decorator** — *helps* for layering optional behavior (logging, caching, retry). *Hurts* when a single conditional would do the job.
- **Repository / Data Mapper** — *helps* when persistence logic needs to be swappable or testable. *Hurts* when it's a thin wrapper that duplicates the ORM.
- **Adapter** — *helps* when bridging an external API to your domain shape. *Hurts* when adapting between two of your own types you control.
- **Builder** — *helps* for objects with many optional fields or invalid intermediate states. *Hurts* for objects with 2–3 params.

Also flag the inverse: code that would clearly benefit from a pattern but uses a long conditional ladder, copy-paste, or god-class instead.

### 2. Readability

Prefer readable over clever. Only flag optimizations that meaningfully matter — don't suggest micro-optimizations that hurt clarity. Concrete signals:

- **Naming** — single-letter variables outside tight loops, abbreviations a newcomer would not recognize, names that lie about what the value holds
- **Function length** — functions over ~50 lines, or functions doing multiple distinct things
- **Nesting depth** — more than ~3 levels of nested `if` / `for` / `try`
- **Magic numbers / strings** — literals with no name explaining what they mean
- **Comment quality** — comments that describe *what* the code does (the code already does that) instead of *why*; outdated comments that contradict the code
- **Control-flow clarity** — unnecessary `else` after `return`, deeply chained ternaries, boolean parameters that flip behavior
- **Premature abstraction** — interfaces or base classes with one implementation, generic types where concrete would read fine
- **Cleverness penalty** — short, dense expressions that take longer to read than a multi-line version

### 3. SOLID & DRY

One signal per principle, scoped to what's visible in the diff:

- **S — Single Responsibility** — a class or function doing two distinct things (e.g. fetching data and rendering it, parsing and validating, computing and persisting). Flag mixed-concern names like `UserManager` or `Helper`.
- **O — Open/Closed** — `switch` or `if`/`elseif` ladders branching on a type/kind field. When the ladder is likely to grow, suggest polymorphism or a registry.
- **L — Liskov Substitution** — subclasses that throw on parent-contract methods, narrow input types, widen output types, or override to return `null`/no-op where the parent guarantees a value.
- **I — Interface Segregation** — fat interfaces with methods clients don't need. Flag interfaces where one implementation throws `NotImplementedException` or returns `null`.
- **D — Dependency Inversion** — business logic that instantiates concrete collaborators with `new ConcreteThing(...)`. Flag missing constructor injection or service-locator anti-patterns.
- **DRY** — near-duplicate blocks across the changed files. Be careful: duplication is cheaper than the wrong abstraction. Flag *true* duplicates (same logic, same intent), not coincidental similarity.

### 4. Common Performance Anti-Patterns

**Boundary:** only these well-known anti-patterns, not a full performance audit. If you're unsure whether something is slow, leave it alone.

- **N+1 queries** — loop over a collection making a per-item query or HTTP call. Suggest eager loading / batching / `IN (...)` queries.
- **I/O inside tight loops** — file read, network call, DB call inside a `for`/`foreach` where batching is possible.
- **Repeated work inside loops** — work that doesn't depend on the loop variable but is recomputed each iteration; hoist it.
- **Missing memoization** — pure, expensive calls hit repeatedly with the same args in the same scope.
- **Unbounded data loads** — `->all()`, `SELECT *` without `LIMIT`, `findAll()` on tables that grow without bound. Suggest pagination/streaming.
- **String concatenation in loops** where a builder, array-join, or stream API is idiomatic in the language.
- **Eager hashing / serialization** of large structures for trivial checks (e.g. JSON-encoding to compare equality, hashing entire objects for cache keys when a small subset would do).

Do **not** flag: theoretical big-O concerns on small collections, algorithm choices that already match the data shape, or readability-improving expressions that happen to allocate slightly more.

### 5. Dead Code (Diff-Level Only)

Spot dead code visible in the diff. Do **not** attempt cross-file or codebase-wide reachability analysis.

- Unused imports / `use` statements newly added
- Unreachable code after `return`, `throw`, `exit`, infinite loops
- Newly added private methods/functions that are never called within the file
- Function parameters that are accepted but never read
- Commented-out code blocks left behind
- Variables assigned but never read
- Conditions that can never be true given the types in scope

For real codebase-wide dead-code detection (PHPStan / Psalm / composer-unused / Deptrac pipeline), use the framework's own tooling — this skill intentionally does not replicate that.

## Workflow

1. **Resolve scope.** Apply the override if the user passed one. Otherwise default to unstaged. If unstaged is empty, fall back through: staged → branch-vs-main → ask the user.
2. **Enumerate changes.**
   ```bash
   git diff <scope> --name-only
   git diff <scope> --stat
   git diff <scope>
   ```
3. **Read context.** For each changed file, read enough surrounding code that you can judge pattern fit, SOLID violations, and call relationships. The diff hunks alone are not enough.
4. **Apply the five dimensions** per changed file. Skip dimensions that don't apply (e.g. pure config edits have no SOLID concerns).
5. **Produce findings** in the output format below.

## Output Format

Group findings by dimension. Each finding follows this shape:

```
[severity] file:line  —  dimension / principle
  Rationale: one sentence on what's wrong and why it matters.
  Suggestion: one concrete change.
```

Severity levels:

- **`issue`** — likely bug, broken contract, or clear anti-pattern. Address before merging.
- **`warn`** — quality concern. Worth fixing but won't block correctness.
- **`info`** — observation or stylistic note. Take it or leave it.

End the report with a summary:

```
Summary
  files reviewed: N
  issue: X · warn: Y · info: Z
  Top issues:
    1. <file:line> — <one-line>
    2. ...
    3. ...
```

If a dimension produced no findings, say so explicitly (e.g. `Performance: no anti-patterns spotted in this diff`). Silence is ambiguous.

## How to Invoke

```
/skill:quality-check                       # default: unstaged working-tree changes
/skill:quality-check staged                # staged changes only
/skill:quality-check all                   # unstaged + staged
/skill:quality-check main..HEAD            # diff range
/skill:quality-check app/Services/Foo.php  # specific file or path
```

## What This Skill Does NOT Do

- **Full performance profiling or benchmarking** — flame graphs, micro-benchmarks, and real load testing are out of scope.
- **Security review** — defer to `security-scanner` (and its Laravel / Shopware specialists).
- **Framework-deep review** — defer to `code-review-laravel` / `code-review-shopware`.
- **Cross-file / codebase-wide dead-code analysis** — PHPStan, Psalm, composer-unused, and Deptrac do this better; this skill stays diff-level.
- **PR-description generation, debug-code scanning, test-coverage gating** — out of scope by design.
- **Auto-applying fixes** — findings are suggestions. The user decides what to change.
