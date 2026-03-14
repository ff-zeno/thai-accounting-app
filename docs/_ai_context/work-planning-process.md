# Work Planning Process

When and how to create execution plans for complex work.

## When to Plan

Create a written plan when:
- The task touches 3 or more files
- The approach is not obvious — multiple valid strategies exist
- The task involves architectural decisions
- The work will take more than one session

Do not create a plan when:
- The task is a single-file fix with an obvious solution
- The change is well-defined and the user gave specific instructions
- It would take longer to write the plan than to do the work

## Plan Structure

Plans live in `docs/exec-plans/active/` while in progress and move to
`docs/exec-plans/completed/` when finished.

Template:

```markdown
# Plan: {Title}

## Problem
{What problem does this solve? One paragraph maximum.}

## Requirements
- {Requirement 1}
- {Requirement 2}

## Approach
{How will this be implemented? Include key decisions and their rationale.}

## Tasks
- [ ] {Task 1}
- [ ] {Task 2}

## Verification
- [ ] {How to verify the work is correct}
```

## Progress Tracking

- Check off tasks as they are completed
- Add notes to tasks if the approach changed during implementation
- If a task reveals unexpected complexity, update the plan before proceeding
- When all tasks are done, move the plan to `completed/`

## Guidelines

- Keep plans under 100 lines — they are working documents, not design docs
- Update the plan when reality diverges from the original approach
- Include rejection rationale for significant decisions (why NOT alternative X)
- Plans are disposable — do not over-invest in formatting or polish
