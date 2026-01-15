---
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
argument-hint: [scope]
description: iterate on changes - examine, improve, verify
---

## scope

$ARGUMENTS

## detect scope

1. **if argument provided**: iterate on specified scope
   - file path → iterate on that file
   - directory → iterate on files in directory
   - concept (e.g. "auth", "tests") → grep and iterate on related code
   - "diff" → force git diff iteration
   - "all" → full codebase iteration
2. else: files edited this conversation → iterate on those
3. else: `git diff HEAD` + `git diff --cached` → iterate on diff
4. else: iterate on codebase (scan for issues, tech debt, improvements)

## examine

for each change, question critically:

- **correctness** - logic right? off-by-one? null/empty handled?
- **approach** - simpler way? over-engineered? under-engineered?
- **edge cases** - failures? boundaries? malformed input?
- **security** - injection? exposure? auth bypass? path traversal?
- **breaking** - contracts changed? callers affected? backwards compat?
- **consistency** - matches surrounding code style? naming conventions?

for non-code (docs, configs, data):
- **accuracy** - factually correct? outdated references?
- **completeness** - missing sections? incomplete examples?
- **clarity** - ambiguous? misleading? typos?

## improve

make corrections directly. no permission needed for:
- bugs, logic errors, typos
- missing error/edge case handling
- security issues
- inconsistencies with codebase patterns

do not:
- refactor unrelated code
- add features beyond the change's scope
- change style preferences without clear issue

## verify

detect project type and run appropriate checks:

```
package.json     → npm test, npm run build, npm run typecheck
Cargo.toml       → cargo check, cargo test, cargo clippy
go.mod           → go build, go test
pyproject.toml   → pytest, mypy
Makefile         → make test, make build
none             → syntax check changed files only
```

run only what's relevant. skip if no test/build system detected.

## report

```
## iterated: [brief scope]

examined:
- [file] [what was checked]

improved:
- [file:line] [issue] → [fix]

verified:
- [what passed or was checked]

concerns:
- [issues needing human decision, if any]
```

if clean:
```
## iterated: [scope]
no issues. changes are solid.
```
