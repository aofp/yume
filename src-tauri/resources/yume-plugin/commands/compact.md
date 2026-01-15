---
allowed-tools: Read, Glob
argument-hint: [preserve focus]
description: compact context with preservation hints
---

## context compaction

$ARGUMENTS

### preservation priorities

if focus specified, ensure the summary retains:
- **file path** → keep full content/changes for that file
- **concept** (e.g. "auth", "api") → preserve all related discussion
- **"all"** → balanced summary of everything
- **blank** → auto-detect most relevant recent work

### compaction guidance

when compacting, preserve:
1. current task and its requirements
2. decisions made and reasoning
3. code changes (file paths, what changed, why)
4. errors encountered and solutions
5. user preferences mentioned

discard:
- verbose explanations already understood
- failed approaches that were abandoned
- repetitive confirmations

### output

after compaction completes, confirm:
```
compacted. preserved: [focus or "recent work"]. ready to continue.
```
