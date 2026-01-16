---
allowed-tools: Read, Glob, TodoRead
argument-hint: [preserve focus]
description: compact context with preservation hints
---

## context compaction

$ARGUMENTS

### parse preservation hints

the arguments may contain structured hints in format:
- `task: <current task description>`
- `files: <comma-separated filenames>`
- `decisions: <semicolon-separated decisions>`
- `preserve error context` (flag)

extract and prioritize these hints for your summary.

### preservation priorities (in order)

1. **current task** - what user is actively working on (from `task:` hint or recent messages)
2. **code changes** - every file edited/written, what changed, and why (from `files:` hint)
3. **key decisions** - architectural choices, approach selections (from `decisions:` hint)
4. **error context** - if flagged, keep error details and their solutions
5. **user preferences** - coding style, naming conventions mentioned
6. **open work** - incomplete tasks, TODOs, questions to address

if a specific file/concept focus is given:
- **file path** → preserve full content and all changes for that file
- **concept** (e.g. "auth", "api") → preserve all related discussion and code

### compaction process

1. **scan conversation** for the hints above
2. **identify keystone messages** - ones that establish context or make decisions
3. **summarize verbose sections** - long explanations, failed attempts
4. **preserve exact code** - don't paraphrase code changes, keep paths and snippets
5. **maintain causality** - if A led to B, preserve that relationship

### what to discard

- repetitive confirmations and acknowledgments
- verbose explanations of well-known concepts
- failed approaches that were completely abandoned
- intermediate debugging output (keep conclusions only)
- chat pleasantries and meta-discussion

### output format

create a dense, information-rich summary that preserves:
```
## context summary

**task**: [what we're working on]

**files touched**: [list with brief change descriptions]

**decisions made**:
- [decision 1]: [rationale]
- [decision 2]: [rationale]

**current state**: [where we left off]

**open items**: [if any TODOs or questions remain]
```

after generating summary, confirm:
```
compacted. preserved: [focus or "auto-detected context"]. ready to continue.
```
