# Debugging Methodology

Systematic approach to finding and fixing bugs. Follow these steps in order.

## Step 1: Reproduce

- Get the exact error message, stack trace, or unexpected behavior
- Reproduce locally before investigating
- If you cannot reproduce, gather more information before guessing

## Step 2: Hypothesize

Form a specific hypothesis about what is wrong:
- "The error occurs because X function receives nil when it expects a value"
- Not: "Something is wrong with the data flow"

A vague hypothesis leads to unfocused investigation. Be specific.

## Step 3: Gather Evidence

Collect evidence to confirm or refute your hypothesis:

- **Read the code**: Trace the execution path from entrypoint to error
- **Check git blame**: When was this code last changed? What changed?
- **Read logs**: Look for errors, warnings, or unexpected values near the failure
- **Check inputs**: What data was the system processing when it failed?
- **Check dependencies**: Are external services, databases, or caches healthy?

## Step 4: Test the Hypothesis

- If evidence confirms: proceed to fix
- If evidence refutes: form a new hypothesis and return to Step 3
- If inconclusive: add logging or debugging output to gather more evidence

## Step 5: Fix and Verify

- Make the minimal change that fixes the root cause
- Do not fix symptoms — find and fix the underlying problem
- Add a test that would have caught this bug
- Verify the fix does not break existing tests
- Check for the same pattern elsewhere in the codebase

## Common Failure Patterns

- **Nil/null dereference**: Check what returns nil/null and when
- **Race condition**: Check concurrent access to shared state
- **State corruption**: Check mutation order and side effects
- **Configuration**: Check environment variables and config files
- **Dependency failure**: Check external service health and timeouts
