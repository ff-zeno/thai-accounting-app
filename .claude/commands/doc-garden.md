# Documentation Garden

Tend to the project's AI-assistance documentation. Check for staleness,
accuracy, and gaps.

## Instructions

### Step 1: Inventory

List all documentation relevant to AI assistance:

```bash
# Find all CLAUDE.md files (exclude worktrees, node_modules, vendor, .git)
find . -name "CLAUDE.md" -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./vendor/*" -not -path "*worktree*"

# Find context docs
ls docs/_ai_context/ 2>/dev/null

# Find commands and agents
ls .claude/commands/ 2>/dev/null
ls .claude/agents/ 2>/dev/null
```

### Step 2: CLAUDE.md Health Check

Read the root CLAUDE.md and evaluate:

- **Rule count**: How many rules? (Target: 7 or fewer)
- **Rule format**: Are rules plain imperatives? (Flag ALL CAPS, exclamation marks)
- **Prose ratio**: How much explanatory text vs. actionable rules? (Less prose = better)
- **Build commands**: Are build/test/lint commands documented with copy-paste snippets?
- **Context map**: Does a table point to just-in-time context docs?
- **Verification checklist**: Is there one at the END of the file?
- **Accuracy**: Do referenced files and paths actually exist?

For each sub-directory CLAUDE.md, check:
- Does it add specificity without repeating parent rules?
- Are referenced files and paths still valid?

### Step 3: Context Doc Freshness

For each file in `docs/_ai_context/`:

```bash
# Check modification dates
stat -c '%n %y' docs/_ai_context/* 2>/dev/null || stat -f '%N %Sm' docs/_ai_context/* 2>/dev/null
```

Flag files not modified in the last 60 days as potentially stale.
Read each flagged file and check whether its content still matches the codebase.

### Step 4: Dead Reference Check

Scan CLAUDE.md and context docs for file path references. Verify each path exists:

```bash
# Extract paths and check existence
grep -ohE '["`]([a-zA-Z0-9_./-]+\.(go|ts|js|py|rs|md|sh|yaml|yml|toml))["`]' CLAUDE.md | tr -d '"`' | while read path; do
  [ ! -e "$path" ] && echo "DEAD REF: $path"
done
```

### Step 5: Gap Analysis

Check whether standard context docs exist:
- Code quality guidelines (naming, error handling, testing patterns)
- Debugging methodology (systematic debugging steps)
- Glossary (domain-specific terminology)
- Architecture overview (for projects with 3+ modules/services)
- Work planning process (for projects using exec-plans)

### Step 6: Report

Present findings:

```markdown
## Documentation Garden Report

### CLAUDE.md Health
- Rules: {count} (target: 7 or fewer)
- Format issues: {list of ALL CAPS rules, excessive prose, etc.}
- Missing elements: {context map, verification checklist, build commands, etc.}
- Dead references: {list of broken paths}

### Context Doc Freshness
- {file}: last modified {date} — {CURRENT / STALE / NEEDS_UPDATE}

### Gaps
- {missing doc}: {why it would help}

### Recommendations (ordered by impact)
1. {most impactful improvement}
2. {second improvement}
```

Do not make changes. Report findings and let the user decide what to act on.
