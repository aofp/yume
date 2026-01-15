---
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(ls:*)
argument-hint: [focus area]
description: initialize context with optional focus
---

## context initialization

$ARGUMENTS

### if focus provided
read and summarize the specified area:
- file path → read file, understand purpose
- directory → list contents, identify key files
- concept (e.g. "auth", "api") → grep for relevant code, map structure
- "all" or blank → scan project structure

### always do
1. identify project type (package.json, Cargo.toml, go.mod, etc.)
2. check for CLAUDE.md, README.md, or docs/
3. note git status if in repo

### output

```
## initialized: [focus or "project"]

type: [project type]
key files: [3-5 most important files for this focus]
structure: [brief layout]

ready to help with [focus area].
```

keep it brief. user wants to start working, not read a novel.
