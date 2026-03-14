# Self-Review

Review uncommitted changes for errors, anti-patterns, and missed edge cases.

**Usage**: `/self-review` or `/self-review quick` (skip build/test/lint)

## Phase 1: Pre-Review Verification

Unless the user specified `quick`, run the project's build, test, and lint commands.
Find these in CLAUDE.md or detect from project files.

Stop if any failures — fix compilation/test issues before reviewing.

## Phase 2: Gather Change Context

Run these commands to understand what changed:

```bash
git status --short
git diff --stat
git diff HEAD
```

Identify:
- Which files changed and how many lines
- Whether changes span multiple packages/modules/services
- Whether tests were added or modified alongside the changes

## Phase 3: Review Changes

Read the full diff and review against these focus areas:

### Error Handling
- Missing error checks after function calls
- Errors logged but not returned or handled
- Silent failures that should surface
- Error messages that lack debugging context

### Defensive Programming
- Nil/null/undefined dereferences
- Missing bounds checks on collections
- Unchecked type assertions or casts
- Race conditions in concurrent code
- Missing cleanup (defer, finally, context cancellation)

### Anti-Patterns
- Code that diverges from existing codebase patterns
- Reinventing utilities that already exist in the project
- Breaking established architectural conventions
- Inconsistent naming relative to surrounding code

### Resource Management
- Unclosed connections, files, or channels
- Goroutines/threads/promises that can leak
- Context not propagated correctly
- Missing timeout or cancellation handling

### Security
- Sensitive data in logs or error messages
- Missing input validation at boundaries
- Injection risks (SQL, command, template)
- Hardcoded secrets or credentials

### Logic
- Off-by-one errors
- Incorrect boolean logic or comparison operators
- Edge cases not handled (empty input, zero values, max values)
- State transitions that can deadlock or loop

## Phase 4: Read Quality Guidelines

If `docs/_ai_context/code-quality-guidelines.md` exists, read it and check the
changes against project-specific quality rules.

## Phase 5: Report Findings

Rate each finding by severity:
- **CRITICAL**: Will cause data loss, security breach, or production crash
- **HIGH**: Likely to cause bugs under load or edge cases
- **MEDIUM**: Anti-pattern, maintainability concern, or quality issue
- **LOW**: Minor style or convention inconsistency

Present findings in this format:

```markdown
## Self-Review Findings

### Summary
- Files reviewed: {count}
- Critical: {count} | High: {count} | Medium: {count} | Low: {count}

### Critical Issues
1. **{file}:{line}** — {description}
   - Problem: {what is wrong}
   - Fix: {how to fix it}

### High Issues
{same format}

### Medium Issues
{same format}

### Patterns Verified OK
- {list of things checked and found acceptable}

### Recommendation
{READY_TO_COMMIT / NEEDS_FIXES / NEEDS_DISCUSSION}
```

Focus on real problems. Do not invent issues to appear thorough.
