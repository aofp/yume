---
allowed-tools: Read, Glob, Grep, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
description: review changes or codebase (read-only)
---

## detect scope

1. files edited this conversation → review those
2. else: `git diff HEAD` + `git diff --cached` → review diff
3. else: review codebase (scan for issues, tech debt, patterns)

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
