# architecture & compliance

## how yume works

yume is a native gui that spawns the **official claude code cli** as a subprocess. we are not an alternate harness, api wrapper, or proxy.

```
yume app → spawns real cli binary → cli handles authentication → anthropic servers
```

### what we do

1. **spawn the real cli** - `claude_spawner.rs` locates and spawns the actual claude binary installed on the user's machine
2. **parse output** - we parse the cli's stdout/stderr to render messages in our gui
3. **forward input** - user input is written to the cli's stdin
4. **add features** - orchestration, memory, background agents run on top of the cli

### what we don't do

- ❌ make direct api calls to anthropic
- ❌ spoof client headers
- ❌ bypass authentication
- ❌ intercept or modify api requests
- ❌ access the api at different price tiers

## why this is acceptable

### 1. anthropic's jan 2026 crackdown

anthropic blocked tools that **spoof headers** to trick servers into thinking requests come from claude code cli when they don't. this allowed apps to bypass api pricing (~$1000+/mo) using flat-rate subscriptions.

blocked pattern:
```
malicious app → [fake headers pretending to be cli] → anthropic servers
```

yume pattern:
```
yume → [spawns real cli] → cli → [authentic requests] → anthropic servers
```

### 2. gui wrappers are explicitly supported

the [claude agent sdk](https://github.com/anthropics/claude-code) exists specifically to enable building wrappers. multiple open source projects do exactly what yume does:

- [claude-code-gui](https://github.com/5Gears0Chill/claude-code-gui) - tauri wrapper
- [claude_agent_desktop](https://github.com/Fergana-Labs/claude_agent_desktop) - electron wrapper
- [opcode](https://github.com/winfunc/opcode) - tauri wrapper

### 3. user's own subscription

yume uses the user's existing claude pro/max subscription through the official cli. we don't provide api keys, don't resell access, and don't circumvent any pricing.

### 4. 100% cli compatibility

because we spawn the real cli:
- subagents work
- mcp servers work
- hooks work
- skills work
- claude.md works
- all cli features work

this proves we're running the real cli, not emulating it.

## code references

### cli binary detection
`src-tauri/src/claude_binary.rs` - finds the installed claude binary

### cli spawning
`src-tauri/src/claude_spawner.rs:218-247`:
```rust
pub async fn spawn_claude(&self, app: AppHandle, options: SpawnOptions) -> Result<SpawnResult> {
    let claude_path = find_claude_binary()?;  // finds real CLI
    let mut cmd = create_tokio_command_with_env(&claude_path);
    cmd.spawn()?  // runs the actual binary
}
```

### output parsing
`src-tauri/src/stream_parser.rs` - parses cli output (we don't modify it)

## comparison: legitimate wrapper vs unauthorized harness

| aspect | unauthorized harness | yume |
|--------|---------------------|------|
| api calls | direct to anthropic | via cli |
| headers | spoofed | n/a (cli handles) |
| authentication | bypassed/stolen | user's own |
| pricing | circumvented | user's subscription |
| cli features | emulated/missing | 100% compatible |

## sources

- [anthropic crackdown - venturebeat](https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses/)
- [claude code legal docs](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance)
- [anthropic usage policy](https://www.anthropic.com/news/usage-policy-update)
- [claude agent sdk](https://github.com/anthropics/claude-code)
