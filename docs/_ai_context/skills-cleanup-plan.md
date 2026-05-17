# gstack skills cleanup plan — revised

**Status:** Analysis complete, pending user execution.
**Last revised:** 2026-04-15 after user clarified actual usage.

## Scope per user

User confirmed they actually use:
- `plan-ceo-review`, `plan-eng-review`, `plan-design-review` (collectively: `plan-*-review`)
- `browse` (for QA testing of live URLs)
- `design-review` (visual audit)

User does not recall using anything else. Drop everything not on that list.

## What gstack is, briefly

gstack is a workflow-bundle skill pack. It installs ~30 skills covering distinct workflow phases — brainstorming (`office-hours`), bug triage (`investigate`), shipping (`ship`), QA (`qa`), code review (`review`), docs updates (`document-release`), retros (`retro`), etc. Each skill is a self-contained markdown file + scripts that teach Claude Code how to run that specific workflow. The idea is you invoke them via `/skillname` and get a specialist workflow instead of a generic answer.

Most of them solve problems the user isn't having. The ones the user has actually used are the plan-review trio (architectural/strategic review of plans), `browse` (headless Chromium for live URL testing), and `design-review` (visual audit). Everything else was overhead.

## Skills to KEEP

| Skill | Why |
|---|---|
| `plan-ceo-review` | Strategic plan review, user actively uses |
| `plan-eng-review` | Engineering plan review, user actively uses |
| `plan-design-review` | Design plan review, user actively uses |
| `browse` | Headless Chromium, required for live-URL QA testing |
| `setup-browser-cookies` | Dependency of `browse` — import real browser sessions for auth |
| `design-review` | Visual audit of shipped UI |
| `design-consultation` | Design system decisions — might be used interchangeably with design-review. Keep as safety net, drop later if never invoked |
| `gstack-upgrade` | Required to upgrade gstack itself |
| `codex` | **Not from gstack.** Standalone skill at `~/.claude/skills/codex` that replaces the codex-cli MCP integration (now disabled). The skill is how `/codex review` / `/codex challenge` / `/codex consult` actually work now — don't drop it, don't touch the project-level `.claude/skills/codex` symlink either (it mirrors the global skill and doesn't conflict). |

That's **9 skills**, down from the ~30+ currently installed.

## Skills to DROP

| Skill | What it was for | Why safe to drop |
|---|---|---|
| `office-hours` | Product brainstorming ("is this worth building?") | User hasn't used it |
| `investigate` | Bug triage workflow | User hasn't used it; they'd rather just ask the question directly |
| `ship` | Release/deploy workflow | User hasn't used it; they manage commits via direct git commands |
| `qa` | Structured QA workflow | User hasn't used it (browse is what they use for actual testing) |
| `review` | Code review of diffs | User hasn't used it; /codex review + conversation review is enough |
| `document-release` | Docs update after shipping | User hasn't used it |
| `retro` | Weekly retrospective | User hasn't used it |
| `plan-devex-review` | DevEx-focused plan review variant | User only uses the big three plan reviews |
| `qa-only` / `qa-design-review` | qa subsets | User hasn't used them |
| `design-shotgun` / `design-html` | Design generation variants | User hasn't used them |
| `land-and-deploy` / `setup-deploy` | Deployment workflow | User hasn't used them |
| `canary` | Canary deployment workflow | User hasn't used it |
| `checkpoint` / `freeze` / `unfreeze` | Session checkpointing utilities | User hasn't used them |
| `careful` | Careful-mode meta-skill | User hasn't used it |
| `autoplan` | Auto-generate plans | User hasn't used it; the user writes plans through conversation |
| `cso` | Chief Security Officer review | User hasn't used it |
| `connect-chrome` | Connect to existing Chrome browser | User hasn't used it; browse is enough |

## Shared infrastructure — DO NOT TOUCH

These live inside `gstack/` and are shared by multiple kept skills. Removing them will break the skills we're keeping.

- `gstack/bin/` (98 MB — compiled shared binary, used by all skills including the kept ones)
- `gstack/node_modules/` (75 MB — shared TypeScript dependencies)
- `gstack/design/` (98 MB — compiled design infrastructure, used by design-review + design-consultation)
- `gstack/browse/` (197 MB — Chromium binary, used by browse skill we're keeping)
- `guard`, `health`, `benchmark`, `learn` — flagged as UNCERTAIN by the earlier analysis because they have high internal hit counts in session logs, suggesting other kept skills may call them internally. Verify by grepping `gstack/ship/SKILL.md`, `gstack/review/SKILL.md`, etc., for these names before removing. If in doubt, leave them.

## Actionable cleanup commands

Execute these in two phases. **Phase 1** is safe drops with no decision required. **Phase 2** is the bigger stuff — verify by invoking kept skills once before proceeding.

### Phase 1 — safe drops

```bash
cd /home/zeno/Dev/personal-projects/thai-accounting-app

# Remove symlinks (codex intentionally excluded — user-level skill replaces codex-cli MCP)
for skill in \
  office-hours \
  investigate \
  ship \
  qa \
  review \
  document-release \
  retro \
  plan-devex-review \
  qa-only \
  qa-design-review \
  design-shotgun \
  design-html \
  land-and-deploy \
  setup-deploy \
  canary \
  checkpoint \
  freeze \
  unfreeze \
  careful \
  autoplan \
  cso \
  connect-chrome \
; do
  rm -f ".claude/skills/$skill"
done

# Remove the actual skill directories inside gstack/
for skill in \
  office-hours \
  investigate \
  ship \
  qa \
  review \
  document-release \
  retro \
  plan-devex-review \
  qa-only \
  qa-design-review \
  design-shotgun \
  design-html \
  land-and-deploy \
  setup-deploy \
  canary \
  checkpoint \
  freeze \
  unfreeze \
  careful \
  autoplan \
  cso \
  connect-chrome \
; do
  rm -rf ".claude/skills/gstack/$skill"
done
```

### Phase 2 — verification

After Phase 1, verify the kept skills still work:
1. `/plan-eng-review` on any open plan doc — should complete without errors
2. `/design-review` on any shipped page — should complete without errors
3. `/browse` to a live URL — should launch Chromium without errors

If all three work, Phase 1 is done. If any fail, check what shared infrastructure got touched and restore from git.

## CLAUDE.md updates required after cleanup

In `/home/zeno/Dev/personal-projects/thai-accounting-app/CLAUDE.md`:

**Delete these rows from the "gstack Workflow Skills" table (around line 84–94):**
- `/office-hours` (product thinking row — but keep the plan-ceo-review reference)
- `/ship` row
- `/qa` row
- `/review` row
- `/retro` row

**Delete these routing rules from the "Skill routing" section (around line 120+):**
- office-hours
- investigate
- ship
- qa
- review
- document-release
- retro
- design-consultation (if you're also dropping this, otherwise keep)

**Keep:**
- plan-ceo-review, plan-eng-review, plan-design-review references
- browse / setup-browser-cookies references
- design-review reference

## Disk savings estimate

| Category | Size | Status |
|---|---|---|
| Dropped symlinks + skill directories | ~1.5 MB | Real savings |
| `gstack/bin/` shared binary | 98 MB | Kept (needed) |
| `gstack/node_modules/` | 75 MB | Kept (needed) |
| `gstack/design/` | 98 MB | Kept (needed for design-review) |
| `gstack/browse/` Chromium | 197 MB | Kept (needed for browse) |

**Real savings: ~1.5 MB.** This cleanup is not about disk space — it's about reducing cognitive overhead of routing rules and CLAUDE.md clutter.

## Rollback plan

All changes are in git. If anything breaks, restore with:

```bash
cd /home/zeno/Dev/personal-projects/thai-accounting-app
git checkout HEAD -- .claude/skills/
git checkout HEAD -- CLAUDE.md
```

The gstack bundle is ~278 MB and is fully checked in per the current repo state. No need to reinstall from the upstream gstack repo.
