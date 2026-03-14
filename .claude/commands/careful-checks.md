# Careful Pre-Commit Checks

Run build, test, and lint as quality gates before committing.

## Instructions

### Step 1: Detect Commands

Read the project's `CLAUDE.md` file. Look for a "Build, Test & Lint" section or similar.
Extract the build, test, and lint commands.

If CLAUDE.md does not specify commands, detect from project files:
- `go.mod` present: `go build ./...`, `go test ./...`, `golangci-lint run`
- `package.json` present: check `scripts` field for `build`, `test`, `lint`
- `Cargo.toml` present: `cargo build`, `cargo test`, `cargo clippy -- -D warnings`
- `pyproject.toml` or `requirements.txt` present: `pytest`, `ruff check .`
- `Makefile` present: check for `build`, `test`, `lint` targets
- Build scripts (e.g., `scripts/build*.sh`): use those

If you still cannot determine the commands, ask the user.

### Step 2: Run Build

Run the detected build command. Record:
- Command executed
- Exit code (PASS/FAIL)
- Duration
- Any error output (first 20 lines if verbose)

If the build fails, stop here. Report the failure and do not proceed.

### Step 3: Run Tests

Run the detected test command. Record:
- Command executed
- Exit code (PASS/FAIL)
- Duration
- Number of tests passed/failed if parseable from output
- Any failure output (first 30 lines)

If tests fail, stop here. Report the failure and do not proceed.

### Step 4: Run Lint

Run the detected lint command. Record:
- Command executed
- Exit code (PASS/FAIL)
- Duration
- Number of lint issues if parseable

Lint failures are warnings, not blockers. Report but do not stop.

### Step 5: Report

Present a summary:

```
Pre-Commit Checks
-----------------
Build: {PASS/FAIL} ({duration})
Tests: {PASS/FAIL} ({duration}, {count} tests)
Lint:  {PASS/FAIL/WARN} ({duration}, {count} issues)

Verdict: {READY TO COMMIT / NOT READY}
```

If all pass, confirm the code is ready to commit.
If any fail, list what needs fixing before commit.
