# Context Engineering Guide

A portable reference for designing AI-assistance infrastructure in any repository.
Grounded in LLM compaction failure research and production experience.

---

## Part 1: Research Foundation

### The 5 Compaction Failure Modes

Long LLM sessions compress prior context to stay within token limits. This compression
systematically loses specific categories of information:

1. **Exact numbers** — Counts, thresholds, line numbers, and metrics get rounded or dropped
2. **Decision rationale** — What was decided survives; why it was decided does not
3. **Conditional logic** — IF/THEN/ELSE chains collapse to just the chosen branch
4. **Cross-file relationships** — Which files depend on which, and why, gets flattened
5. **Open questions** — Unresolved items get silently treated as resolved

These are not random — they are structural. Systems that explicitly preserve these categories
survive compaction far better than unstructured prose.

### Working Memory Constraints

LLMs effectively maintain 5-10 active constraints simultaneously (ref: arXiv:2409.10715).
Beyond this threshold, earlier constraints degrade. Implications:

- Root CLAUDE.md should contain 7 or fewer rules
- Complex instructions belong in just-in-time context docs, not the root file
- Verification checklists work best at the END of a document (U-shaped attention)

### Claude Design Principles

Effective instructions for Claude follow specific patterns:

- **Plain imperatives** — "Do not commit without permission" over "NEVER COMMIT!!!"
- **No emphatic language** — ALL CAPS, exclamation marks, and "CRITICAL" labels compete
  with each other; when everything is critical, nothing is
- **U-shaped attention** — Content at the start and end of a document gets the most
  attention; put verification checklists at the end
- **Just-in-time loading** — Load context docs when needed, not all at once
- **Structured over prose** — Tables and bullet lists survive compaction better than paragraphs

---

## Part 2: CLAUDE.md Design Principles

### Root CLAUDE.md Rules

1. Limit to 7 rules maximum — beyond this, earlier rules degrade
2. Rules are plain imperatives — "Do not X" not "NEVER X"
3. No explanatory prose competing with rules — move explanations to context docs
4. Build/test/lint commands documented inline with copy-paste snippets
5. Context map pointing to just-in-time docs (table format)
6. Verification checklist at END of file (leverages U-shaped attention)
7. System overview is a concise table, not paragraphs

### Hierarchical CLAUDE.md

For monorepos or large projects, use per-directory CLAUDE.md files:

```
CLAUDE.md                          # Root: project-wide rules + context map
services/auth/CLAUDE.md            # Service-specific rules + patterns
services/auth/billing/CLAUDE.md    # Subsystem-specific details
```

Each level adds specificity without repeating parent rules.
Claude loads all CLAUDE.md files in the ancestor chain automatically.

### What Belongs Where

| Content | Location |
|---------|----------|
| Rules (7 max) | Root CLAUDE.md |
| Build/test/lint commands | Root CLAUDE.md |
| Context map | Root CLAUDE.md |
| Architecture overview | `docs/_ai_context/architecture-overview.md` |
| Code quality patterns | `docs/_ai_context/code-quality-guidelines.md` |
| Debugging methodology | `docs/_ai_context/debugging-methodology.md` |
| Glossary/terminology | `docs/_ai_context/_glossary.md` |
| Service-specific rules | `{service}/CLAUDE.md` |

---

## Part 3: Diagnostic Checklist

Use this to audit any project's AI-assistance setup.

### CLAUDE.md Audit

- [ ] Root CLAUDE.md exists
- [ ] Contains 7 or fewer rules
- [ ] Rules are plain imperatives (no ALL CAPS, no exclamation marks)
- [ ] Build/test/lint commands are documented with copy-paste snippets
- [ ] Context map table points to modular docs
- [ ] No prose paragraphs competing with rules
- [ ] Verification checklist at end of file

### Context Architecture Audit

- [ ] `docs/_ai_context/` directory exists
- [ ] Context docs are modular (one topic per file, under 100 lines each)
- [ ] README.md in `_ai_context/` explains conditional loading pattern
- [ ] Glossary file exists with domain-specific terms
- [ ] No stale docs (check modification dates vs. code changes)

### Commands Audit

- [ ] `.claude/commands/` directory exists
- [ ] At least one quality-gate command (build/test/lint)
- [ ] Self-review or code-review command exists
- [ ] Commands reference context docs where needed

### Agents Audit

- [ ] `.claude/agents/` directory exists (if using agents)
- [ ] Agents have focused roles (not catch-all)
- [ ] Agent descriptions match available tool sets

### Session Continuity Audit

- [ ] Checkpoint system exists (within-session compaction resilience)
- [ ] Handoff system exists (cross-session state transfer)
- [ ] `.claude/sessions/` is git-ignored
- [ ] Auto-memory (MEMORY.md) is maintained and concise

### Scoring

**Tier 1 — Minimal** (any project benefits):
- Root CLAUDE.md with rules + build commands
- 2-3 context docs
- 1-2 commands
- .gitignore entries for AI artifacts

**Tier 2 — Productive** (active development projects):
- All of Tier 1
- Agents for code review and testing
- Exec-plans directory for tracking complex work
- Checkpoint system for compaction resilience
- Glossary with domain terms
- Context map in CLAUDE.md

**Tier 3 — Gold Standard** (large/complex projects):
- All of Tier 2
- Per-service CLAUDE.md hierarchy
- Specialized agents (security, performance, documentation)
- Multi-model review workflows
- Comprehensive _ai_context/ library
- Session handoff system (e.g., spectre)

---

## Part 4: Prescriptive Architecture

### Tier 1 — Any Project

```
CLAUDE.md                              # 7 rules + build commands + context map
docs/_ai_context/
  code-quality-guidelines.md           # Naming, error handling, test patterns
  debugging-methodology.md             # Systematic debugging steps
  _glossary.md                         # Domain terminology
.claude/
  commands/
    careful-checks.md                  # Build + test + lint gate
  settings.local.json                  # User-specific settings (git-ignored)
.gitignore                             # Add: .claude/sessions/, .claude/settings.local.json
```

### Tier 2 — Active Development (Default)

Add to Tier 1:

```
docs/_ai_context/
  README.md                            # Loading rules and file index
  work-planning-process.md             # When/how to create execution plans
  architecture-overview.md             # System design and service interactions
docs/exec-plans/
  active/                              # In-progress plans
  completed/                           # Archived finished work
  templates/
    prp-base.md                        # Plan template
.claude/
  commands/
    checkpoint.md                      # Within-session compaction insurance
    self-review.md                     # Pre-commit code review
    doc-garden.md                      # Documentation maintenance
  agents/
    code-reviewer.md                   # Independent code review
    testing-specialist.md              # Comprehensive test runner
    documentation-specialist.md        # Doc accuracy and gap analysis
  sessions/                            # Git-ignored checkpoint storage
```

### Tier 2 File Descriptions

**CLAUDE.md** (~50 lines):
- 7 rules: commit discipline, build/test/lint, conventional commits, verify execution paths,
  no TODOs in complete code, write state to disk, verification checklist
- System overview table (services/modules and their purpose)
- Build/test/lint section with copy-paste commands
- Git workflow section (branching, commit format)
- Context map (table pointing to docs/_ai_context/)
- Verification checklist at END

**self-review.md** (~80 lines):
- Phase 1: Run build/test/lint (detected commands)
- Phase 2: Gather change context (git diff, modified files)
- Phase 3: Review changes against codebase patterns
- Phase 4: Consolidate findings with severity ratings (CRITICAL/HIGH/MEDIUM/LOW)

**careful-checks.md** (~40 lines):
- Runs build, test, lint in sequence
- Reports pass/fail with timing
- Stop-on-failure behavior

**doc-garden.md** (~60 lines):
- Scan docs/_ai_context/ for staleness
- Check CLAUDE.md accuracy against actual project structure
- Identify missing context docs based on project type
- Suggest updates or removals

**code-reviewer.md** (~100 lines):
- Reviews uncommitted changes against codebase patterns
- Severity-rated findings
- Focus areas: error handling, security, anti-patterns, resource leaks
- Language-aware review criteria

**testing-specialist.md** (~80 lines):
- Runs build/test/lint
- Validates test coverage for changed files
- Reports failures with context

**documentation-specialist.md** (~60 lines):
- Reviews CLAUDE.md hierarchy for accuracy
- Checks context docs for staleness
- Identifies gaps in documentation coverage

### Tier 3 — Large/Complex Projects

Add to Tier 2:

- Per-service CLAUDE.md files in each service directory
- Specialized agents (security-reviewer, performance-analyst)
- Multi-model review commands (orchestrating Claude + other models)
- Comprehensive _ai_context/ library (10+ topic files)
- Session handoff system with structured state transfer
- Integration test commands with environment management

---

## Part 5: Language-Specific Patterns

### Go

```yaml
build: go build ./...
test: go test ./...
lint: golangci-lint run
```

Key patterns for AI context:
- Error handling: check every error, wrap with `fmt.Errorf("context: %w", err)`
- Table-driven tests with `t.Run()`
- Constructor pattern: `NewXxx(deps) *Xxx`
- Interface-first design for testability

### Node.js / TypeScript

```yaml
build: npm run build  # or: yarn build, pnpm build, bun build
test: npm test        # or: vitest, jest
lint: npm run lint    # or: eslint ., biome check
```

Key patterns for AI context:
- Async/await error handling (try/catch at boundaries)
- Import path conventions (@ aliases, barrel exports)
- Test file co-location vs. __tests__ directory
- Environment variables via .env files

### Python

```yaml
build: pip install -e .  # or: poetry install, pdm install
test: pytest             # or: python -m pytest
lint: ruff check . && mypy .  # or: flake8, black --check
```

Key patterns for AI context:
- Type hints (PEP 484+)
- Virtual environments (venv, poetry, conda)
- pytest fixtures and conftest.py
- Exception handling patterns

### Rust

```yaml
build: cargo build
test: cargo test
lint: cargo clippy -- -D warnings && cargo fmt --check
```

Key patterns for AI context:
- Ownership and borrowing rules
- Result<T, E> error propagation with `?`
- Module system (mod.rs vs. file-per-module)
- Trait-based polymorphism

### Generic Fallback

If the language is not listed above, detect from project files:
- Build: look for Makefile, justfile, build scripts
- Test: look for test directories, test configuration files
- Lint: look for linter configuration (.eslintrc, .rubocop.yml, etc.)

---

## Part 6: Checkpoint Template

Use this template when creating session checkpoints. Each field targets a specific
compaction failure mode.

```markdown
# Checkpoint: {branch} @ {short-hash}
**Time**: {ISO-8601}

## Current State
- Build: {PASS/FAIL/UNKNOWN}
- Tests: {PASS/FAIL/UNKNOWN}
- Modified files: {count} ({list})

## Decisions Made (preserve rationale)
- DECISION: {what} | WHY: {rationale} | REJECTED: {alternatives}

## Conditional Logic (preserve IF/THEN chains)
- IF {condition} THEN {action} BECAUSE {rationale}

## Open Questions (do not silently resolve)
- OPEN: {question} | IMPACTS: {what}
- ASSUMED: {assumption} | VERIFY: {how}

## Key Numbers (do not round)
- {metric}: {exact value} | CONTEXT: {where/how derived}

## Files to Re-Read After Compaction
- {path}: {why this file matters for current task}

## Files Already Processed (do NOT re-read)
- {path}: {one-line summary of what was learned}

## Next Actions (ordered)
1. {most important next step}
2. {second step}
```

### When to Checkpoint

- Before tackling a complex sub-task that will generate significant context
- When you notice the session has been running for a long time
- After completing a significant milestone
- Before switching focus areas within the same session
- When you have accumulated decisions, numbers, or conditional logic worth preserving

### What to Include

- Only information that would be lost to compaction and is hard to re-derive
- Skip information that is easily re-read from files (code content, configs)
- Focus on decisions, rationale, cross-file relationships, and exact numbers
- Include the ordered next-actions list to maintain task continuity

---

## Part 7: Subagent Output Contracts

When delegating work to subagents, request structured returns to prevent information
loss in the handoff.

### Standard Return Format

```markdown
## FINDINGS
- {finding_1}: {detail}
- {finding_2}: {detail}

## FILE_PATHS
- {path}: {relevance}

## DECISIONS
- DECISION: {what} | WHY: {rationale}

## OPEN_ITEMS
- {item}: {what needs resolution}
```

### Guidelines

- Request structured output explicitly in agent prompts
- Target 1-2K tokens of structured data over 5K tokens of prose
- Include file paths with line numbers for traceability
- Require severity ratings for findings (CRITICAL/HIGH/MEDIUM/LOW)
- Ask agents to separate facts from recommendations

### Prompt Pattern for Structured Returns

When launching a subagent, include this instruction:

> Return your results in this structure: FINDINGS (bulleted, with severity),
> FILE_PATHS (with line numbers and relevance), DECISIONS (with rationale),
> OPEN_ITEMS (unresolved questions). Keep total output under 2K tokens.
> Structured data is preferred over prose explanations.

---

## Quick Reference Card

| Principle | Rule |
|-----------|------|
| Rules in root CLAUDE.md | 7 maximum |
| Rule format | Plain imperatives |
| Verification checklist | End of file |
| Context docs | Just-in-time, not front-loaded |
| Active constraints | 5-10 max in working memory |
| Checkpoint frequency | Before complex sub-tasks |
| Subagent returns | Structured, under 2K tokens |
| Doc staleness check | Compare mod dates to code changes |
