# Tool Schema Reference (UI Expectations)

This reference captures the **input fields** the UI reads for tool rendering and analytics.
It is derived from `src/renderer/components/Chat/MessageRenderer.tsx` and `src/renderer/stores/claudeCodeStore.ts`.

If the shim cannot support a tool, **do not** advertise it in `system.tools`.

## File Tools

### `Read`
- **Input fields used by UI:** `file_path`
- **Notes:** The result is rendered as plain text with a summary based on line count.

### `Write`
- **Input fields used by UI:** `file_path`, `content`
- **Notes:** UI builds a diff from `content` for display; tool_result can be a short confirmation.

### `Edit`
- **Input fields used by UI:** `file_path`, `old_string`, `new_string`
- **Notes:** UI builds a diff from `old_string`/`new_string`; tool_result can be a short confirmation.

### `MultiEdit`
- **Input fields used by UI:** `file_path`, `edits[]`
- **Each edit:** `{ old_string, new_string }`
- **Notes:** UI builds a diff from `edits`; tool_result can be a short confirmation.

### `NotebookEdit`
- **Input fields used by UI:** `notebook_path` (fallback for file path)
- **Notes:** Rendered similarly to file edits.

## Search Tools

### `Glob`
- **Input fields used by UI:** `pattern`, `path?`
- **Output expectation:** Newline-delimited file paths (UI summarizes line count and paths).

### `Grep`
- **Input fields used by UI:** `pattern`, `path?`
- **Output expectation:** Line-oriented matches (`path:line:content`) are summarized best.

### `LS`
- **Input fields used by UI:** `path?`
- **Output expectation:** Newline-delimited directory entries.

## Command Tool

### `Bash`
- **Input fields used by UI:** `command`
- **Notes:** Output is rendered as a preformatted block.

## Web Tools

### `WebSearch`
- **Input fields used by UI:** `query`

### `WebFetch`
- **Input fields used by UI:** `url`

## Task & Agent Tools

### `Task`
- **Input fields used by UI:** `description`, `subagent_type?`
- **Notes:** Messages may include `parent_tool_use_id` when subagents emit events.

### `TaskOutput`
- **Input fields used by UI:** none (UI parses output content).
- **Notes:** Output is parsed for `<task_id>` and `<output>` tags; if absent, UI falls back to generic rendering.

## Task Management

### `TodoWrite`
- **Input fields used by UI:** `todos[]`

## Other Tools

### `Skill`, `LSP`, `KillShell`
- **Input fields used by UI:** none (generic renderer).
- **Notes:** If implemented, pass through inputs without transformation.

## Recommendation for Shims
- Map provider tool arguments to the input fields above.
- Prefer `file_path` over `path` for file tools.
- Keep `tool_result.content` concise; the UI uses tool input for diffs.
