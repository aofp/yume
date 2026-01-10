# yurucode plugin

core plugin for yurucode.

## commands

### /commit
concise, lowercase git commits:
- all lowercase, no periods, under 50 chars
- present tense: add, fix, update, remove, refactor

### /review
quick code review of current changes:
- bugs, security, performance, style, tests
- verdict: ready / needs work / critical issues

## agents

### yurucode-architect
plans architecture, decomposes tasks, identifies dependencies and risks.

### yurucode-explorer
codebase exploration and context gathering. read-only.

### yurucode-implementer
makes small, focused code edits after planning.

### yurucode-guardian
reviews for bugs, security issues, performance problems.

### yurucode-specialist
domain-specific tasks: tests, docs, devops, data processing.

## hooks

### yurucode guard
blocks dangerous operations:
- destructive commands (rm -rf, dd, format)
- privilege escalation (sudo, chmod +s)
- system modifications (shutdown, systemctl)
- remote code execution (curl|sh, eval)
- dangerous git (force push, reset --hard)
- protected paths (.ssh, .aws, /etc)

## version
1.3.0
