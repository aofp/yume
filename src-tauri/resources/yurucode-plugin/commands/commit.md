---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
description: create a concise, lowercase commit
---

## context

- status: !`git status`
- diff: !`git diff HEAD`
- recent commits: !`git log --oneline -3`

## your task

stage changes and commit with a yurucode-style message:

- all lowercase, no period, under 50 chars
- present tense: add, fix, update, remove, refactor
- specific but minimal: `fix auth token refresh` not `Fixed the auth bug`

examples:
```
fix session restore on crash recovery
add dark mode toggle to settings
update token tracking for opus model
```

only use tool calls, no text output.
