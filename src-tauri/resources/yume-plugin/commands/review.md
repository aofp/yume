---
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
argument-hint: [scope]
description: review changes or codebase (read-only)
---

## scope

$ARGUMENTS

## detect scope

1. **if argument provided**: review specified scope
   - file path → review that file
   - directory → review files in directory
   - concept (e.g. "auth", "security") → grep and review related code
   - "diff" → force git diff review
   - "all" → full codebase scan
2. else: files edited this conversation → review those
3. else: `git diff HEAD` + `git diff --cached` → review diff
4. else: review codebase (scan for issues, tech debt, patterns)

## review

check for:
- **bugs** - logic errors, edge cases, null handling
- **security** - injection, exposure, auth issues
- **performance** - n+1 queries, unnecessary work, memory leaks
- **style** - consistency, naming, patterns
- **tech debt** - todos, hacks, outdated patterns

## output

```
## review: [scope summary]

issues:
- [severity] description (file:line)

suggestions:
- optional improvements

verdict: ready / needs work / critical
```

if clean:
```
## review: [scope]
looks good. no issues found.
```

this is read-only. use `/iterate` to fix issues.
