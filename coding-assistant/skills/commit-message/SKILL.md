---
name: commit-message
description: Generates well-structured git commit messages by analyzing staged changes. Presents the proposed message for user approval before creating the commit.
---

# Commit Message Generator

## OMP Invocation Contract

When `/skill:commit-message` injects this skill body, treat the injection itself as a direct user request: create a commit message for the repository's already-staged changes. Do this immediately before continuing unrelated earlier work. If the command includes trailing text, use it only as extra context for the message.

Hard rules:

1. **NO AI ATTRIBUTION**: Do not add any of the following to commit messages:
   - Co-Authored-By lines for AI assistants
   - "Generated with AI coding tools" or similar footers
   - Links to AI tools or services
   - Emojis or decorative elements
   - Metadata footers or automation notes
   - Any indication that AI was involved

2. **FRESH GIT DATA REQUIRED**: Always run git commands fresh without using any cached results:
   - Run `git status --porcelain` for unambiguous staged file detection
   - Run `git diff --staged` to see actual staged changes
   - Run `git log --oneline -5` to review recent commit wording
   - Do not rely on cached git command outputs
   - Each invocation must fetch current repository state

3. **NEVER STAGE FILES**: Analyze only already-staged changes:
   - Never run `git add` commands
   - Never stage files on behalf of the user
   - Never modify staged files
   - The user is solely responsible for staging files
   - If no files are staged, inform the user and stop

4. **CONFIRMATION REQUIRED BEFORE COMMITTING**: After generating the commit message, present it to the user and ask for approval:
   - Display the exact proposed message text so the user can review it
   - Present two options: `Yes, commit with this message` and `No, revise it`; wait for the user's answer
   - Only execute `git commit` if the user explicitly approves
   - If the user declines or requests changes, do not commit; ask for clarification and regenerate

These requirements are non-negotiable.

## When to Use This Skill

Use this skill when:
- You're ready to commit changes but need help writing a clear commit message
- You want to follow git commit message best practices
- You have complex changes that need proper documentation
- You want consistent commit message formatting across your project
- You need to explain the reasoning behind your changes
- You're working on a team and want clear commit history

## CRITICAL: Keep Commits Clean and Professional

**Generate CLEAN, PROFESSIONAL commit messages WITHOUT any AI attribution or metadata.**

**Absolutely NO:**
- Co-Authored-By lines (AI assistants, etc.)
- "Generated with AI coding tools" or similar AI references
- Emoji decorations or fancy formatting
- Metadata tags or unnecessary footers
- Any indication that AI was involved

**Why?** Your commit messages should appear as if written by a human developer. They become part of your project's permanent history and should maintain professionalism and authenticity.

## What This Skill Does

Perform this workflow:

1. **Change Analysis**
   - Reviews git diff to understand what changed
   - Identifies the scope and impact of changes
   - Recognizes patterns (bug fixes, features, refactoring, etc.)
   - Analyzes multiple files and their relationships

2. **Subject Line Generation**
   - Creates concise summaries (50 characters or less)
   - Uses imperative mood ("Add feature" not "Added feature")
   - Focuses on what the commit accomplishes
   - Avoids unnecessary details in the subject

3. **Description Writing**
   - **ALWAYS formats as a bulleted list with each point starting with a dash (NON-NEGOTIABLE)**
   - **This structure NEVER changes regardless of git log patterns**
   - Briefly explains WHY changes were made
   - Keeps each point concise and focused
   - Only includes essential context
   - Notes breaking changes if any
   - References related issues or tickets when applicable
   - Git log may inform word choice, but NEVER changes the bullet list format

4. **Format Adherence**
   - Follows conventional commit best practices
   - Separates subject from body with blank line
   - Wraps body text at 72 characters
   - Uses bullet points for multiple changes
   - Maintains consistent tone and style

## How to Use

Simply invoke the skill when you're ready to commit:

```
/skill:commit-message
```

Or ask for help with a specific commit:

```
/skill:commit-message Write a commit message for my authentication changes
```

```
I've staged changes to the user model and auth controller. Help me write a commit message.
```

## Critical Restrictions - What NOT to Include

**Your commit messages must be CLEAN and PROFESSIONAL. Do NOT include:**

1. **NO Co-Authored-By Lines**
   - `Co-Authored-By: AI Tool <noreply@example.com>`
   - `Co-Authored-By: AI Assistant <...>`
   - Any co-authorship attribution to AI tools

2. **NO AI-Generated Attribution**
   - "Generated with AI coding tools"
   - "Created by AI" or similar references
   - Links to AI tools or services
   - Any mention of automation or AI assistance

3. **NO Decorative Elements**
   - Emoji in commit messages
   - Fancy formatting or ASCII art
   - Unnecessary symbols or decorations

4. **NO Metadata Tags or Footers**
   - Tool version information
   - Timestamp footers
   - Custom metadata fields
   - Unnecessary technical tags

**Remember:** Commit messages become part of your project's permanent history. They should appear as if written by a professional human developer, maintaining authenticity and credibility.

## Workflow

When invoked, perform these steps in order and do not wait for an additional instruction:

1. **Analyze Staged Changes (MUST RUN FRESH)**
   - Run `git status --porcelain` to get unambiguous staged file list
   - Run `git diff --staged` to see the actual changes
   - Review recent commits with `git log --oneline -5` to check wording patterns ONLY (not structure)
   - **CRITICAL**: These commands MUST be executed fresh - do NOT use cached results
   - **CRITICAL**: NEVER run `git add` - the user is responsible for staging files
   - **IMPORTANT**: Only analyze files that are already staged - NEVER stage files
   - **IMPORTANT**: Git log is ONLY for word choice inspiration - NEVER change the bullet list structure
   - If no staged changes found, inform user and STOP - do NOT create a commit or stage files

2. **Understand the Context**
   - Identify the type of change (feature, fix, refactor, docs, test, etc.)
   - Determine the scope (which part of the codebase)
   - Recognize the impact (breaking change, enhancement, bug fix)

3. **Generate Subject Line**
   - Start with a verb in imperative mood
   - Keep it under 50 characters
   - Don't end with a period
   - Make it meaningful and specific
   - Examples:
     - "Add user authentication with JWT"
     - "Fix null pointer in payment processor"
     - "Refactor database query optimization"
     - "Update API documentation for v2 endpoints"

4. **Write Concise Description**
   - **MUST format as a bulleted list with each point starting with a dash (MANDATORY)**
   - **Git log provides wording ideas ONLY - NEVER change the bullet list structure**
   - Keep each point brief and focused (1 line per point)
   - Only include essential context not obvious from the diff
   - Note breaking changes if any
   - Reference issue numbers or tickets
   - **CRITICAL - READ THIS**: Do NOT add any AI-generated notes, AI coding tools references, Co-Authored-By lines, emojis, or ANY metadata. Keep the commit message clean and professional as if written by a human developer. This is NON-NEGOTIABLE.
   - Format example:
     ```
     Add user authentication with JWT

     - Replaces session-based auth with JWT for better API scalability
     - Easier mobile client integration
     - Breaking change: Session endpoints deprecated, use Authorization header
     - Fixes #123
     ```

5. **Present Message and Ask for Confirmation**
   - Display the generated commit message in full (subject and body)
   - Use the `ask` tool for the confirmation prompt whenever it is available
   - The `ask` tool prompt must include the exact proposed message text
   - Present exactly two options: `Yes, commit with this message` and `No, revise it`
   - Wait for the user's explicit answer before committing
   - **ABSOLUTELY NO AI ATTRIBUTION**: Do NOT add AI coding tools attribution, Co-Authored-By lines, "Generated with" footers, emojis, or ANY indication that AI was involved. The commit must appear 100% human-written.

6. **Create Commit or Regenerate Based on Response**
   - **If user approves**: Execute `git commit` with the approved message using HEREDOC format
   - **If user declines or wants changes**: Ask what specifically needs changing, then return to Step 3 (regenerate the message with the user's feedback)
   - **Do NOT commit without explicit user approval**
   - After committing, run `git log -1 --format=%B` to verify the message has NO AI attribution, Co-Authored-By lines, or metadata
   - If any AI attribution is found, immediately amend the commit to remove it
   - Display the final commit message to the user

## Commit Message Structure

### Subject Line Format

```
<type>: <short description>
```

Or simply:

```
<short description>
```

**Types** (optional, use if your project follows conventional commits):
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes (formatting, etc.)
- refactor: Code refactoring
- test: Adding or updating tests
- chore: Maintenance tasks

**Subject Line Rules:**
- Maximum 50 characters
- Start with capital letter
- Use imperative mood
- No period at the end
- Be specific and meaningful

### Body Format

```
<blank line after subject>

<Detailed explanation of the change>

<Additional paragraphs as needed>

- Bullet points for lists
- More bullet points

<Footer with references>
```

**Body Rules:**
- **ALWAYS format as a bulleted list with each point starting with a dash (MANDATORY)**
- **Git log is ONLY for wording inspiration - NEVER change this structure**
- Keep each point concise (1 line per point)
- Explain the WHY briefly, not just the WHAT
- Use present tense
- Include breaking changes if any
- Reference issues/tickets at the end

## Examples

**Notice:** All examples below demonstrate CLEAN commit messages without any AI attribution, Co-Authored-By lines, emojis, or metadata. This is the ONLY acceptable format.

### Example 1: Feature Addition

**Staged changes:** New email notification system

**Generated message:**
```
Add email notification system for user events

- Implements queued email notifications to keep users informed about account activities
- Uses Laravel notifications with customizable user preferences
- Related to #456
```

### Example 2: Bug Fix

**Staged changes:** Fix in payment processing

**Generated message:**
```
Fix race condition in payment processing

- Adds pessimistic locking and unique constraints
- Prevents duplicate charges when concurrent requests process the same order
- Fixes #789
```

### Example 3: Refactoring

**Staged changes:** Code cleanup and optimization

**Generated message:**
```
Refactor user service for better testability

- Extracts validation logic into separate methods
- Adds dependency injection for better testing
- Improves type hints throughout the service
- No functional changes, all tests pass
```

### Example 4: Documentation Update

**Staged changes:** Updated README and API docs

**Generated message:**
```
Update API documentation for v2 endpoints

- Adds comprehensive endpoint descriptions
- Includes request/response examples
- Provides migration guide from v1 to help developers integrate more easily
```

### Example 5: Multiple Related Changes

**Staged changes:** Several files related to performance improvements

**Generated message:**
```
Optimize database queries for dashboard page

- Adds eager loading, caching, and indexes
- Reduces queries from 45+ to 8
- Improves load time by 60% (850ms -> 340ms)
- Closes #234
```

**NEVER do this:**
```
Optimize database queries for dashboard page

- Adds eager loading, caching, and indexes
- Reduces queries from 45+ to 8
- Improves load time by 60% (850ms -> 340ms)
- Closes #234

Generated with AI coding tools
Co-Authored-By: AI Tool <noreply@example.com>
```
**This is completely unacceptable and defeats the purpose of professional commit messages.**

## Best Practices

1. **Subject Line Excellence**
   - Be specific: "Fix login bug" -> "Fix null pointer in OAuth callback"
   - Use imperative: "Add feature" not "Added feature" or "Adds feature"
   - Stay brief: If it's too long, you're including too much detail

2. **Body Brevity**
   - Format as bulleted list with dashes
   - Answer: Why is this change needed? (1 line per point)
   - Mention what changed only if not obvious from subject
   - Skip implementation details unless critical
   - Include: Breaking changes if any, related issues

3. **Formatting Consistency**
   - One blank line between subject and body
   - Format body as bulleted list with dashes
   - Keep each point concise (1 line per point)
   - Wrap lines at 72 characters

4. **Project Context**
   - Match your project's commit message style
   - Use conventional commits if your team does
   - Include ticket references if required
   - Follow any team-specific conventions

5. **Meaningful Content**
   - Avoid: "Fix bug" or "Update code"
   - Avoid: Repeating what the diff shows
   - Avoid: Long explanations of implementation details
   - Include: Brief context about WHY (bulleted list format)

6. **Absolute Requirement: NO AI Attribution**
   - **NEVER** add Co-Authored-By lines for AI tools
   - **NEVER** add "Generated with" or AI tool references
   - **NEVER** add emojis or decorative elements
   - **NEVER** add metadata tags or automation footers
   - Commit messages MUST appear human-written and professional
   - This maintains authenticity and project credibility

## Integration with Your Workflow

**Before Committing:**
```bash
# Step 1: YOU stage the files (the skill will NOT do this)
git add .

# Step 2: Invoke the skill to generate commit message
/skill:commit-message
```

**For Specific Changes:**
```bash
# Step 1: YOU stage specific files
git add src/auth/*

# Step 2: Ask for commit message
/skill:commit-message Help me write a message for these auth changes
```

**Quick Review:**
```
I've staged my changes. What would be a good commit message?
```

**Important:** Always stage files yourself with `git add` before invoking this skill. The skill will NOT stage files for you.

## Tips for Best Results

1. **Stage Related Changes**: Group related changes together for coherent commits
2. **Review the Diff**: Understand what changed before requesting a message
3. **Provide Context**: Mention why you made the changes if it's not obvious
4. **Check Project Style**: Review recent commits to match your project's style
5. **Edit if Needed**: The generated message is a starting point - adjust as needed
6. **Keep Commits Atomic**: One logical change per commit makes better messages

## Common Commit Message Patterns

**New Feature:**
```
Add [feature name]

- [Why it's needed]
- [What it does]
- [Any other relevant points]
```

**Bug Fix:**
```
Fix [specific problem]

- [What caused it]
- [How it's fixed]
- [Fixes #issue]
```

**Refactoring:**
```
Refactor [component] for [benefit]

- [What changed]
- [Why it's better]
- [Tests pass/no functional changes]
```

**Documentation:**
```
Update [what documentation]

- [What changed and why]
```

**Performance:**
```
Optimize [what] for [improvement]

- [Key metrics showing improvement]
- [What changed to achieve this]
```

## What This Skill Won't Do

- Won't stage files (you must run `git add` yourself first)
- Won't modify your staged changes
- Won't force a specific commit message style (adapts to your project)

## Related Use Cases

- Writing clear commit messages for team projects
- Documenting complex changes for future reference
- Creating meaningful git history for code archaeology
- Preparing commits for code review
- Following conventional commits standard
- Generating changelog-friendly commit messages
- Training junior developers on good commit practices

## Technical Implementation

Generate the message by:
1. Using `git status` and `git diff --staged` to analyze changes
2. Reviewing `git log` for wording patterns ONLY (NEVER to change structure)
3. Applying commit message best practices with mandatory bullet list format
4. Generating structured messages with subject and bulleted body
5. Presenting messages in proper format for direct use

Follow this workflow every time so the resulting commit message is professional, informative, and free of AI attribution.
