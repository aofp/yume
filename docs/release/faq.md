# faq

## general

**what is this?**
desktop app wrapping claude cli. adds tabs, auto-compaction, cost tracking.

**official anthropic product?**
no. independent.

**need anthropic subscription?**
yes. yume is just the interface.

**what's the $29 for?**
pro license: 99 tabs instead of 3. one-time payment.

---

## install

**mac "app is damaged"**
```bash
xattr -cr /Applications/Yume.app
```
or right-click → open

**can't find claude**
```bash
claude --version  # should show version
```
if not found, reinstall: `npm install -g @anthropic-ai/claude-code`

**windows defender blocks**
click "more info" → "run anyway"

**linux won't run**
```bash
chmod +x yume-*.AppImage
```

---

## usage

**only 3 tabs?**
trial mode (3 tabs, 1 window). pro is $29 (99 tabs, 99 windows).

**where are conversations saved?**
`~/.claude/projects/` — same as claude cli

**what does auto-compact do?**
at configurable threshold (default 75%): summarizes old messages, keeps recent ones and active code. warn at T-5%, auto at T%, force at T+5%.

**can i adjust thresholds?**
yes. settings → compaction.

**why does provider switch fork session?**
different context formats. forking keeps both intact.

---

## data

**does it phone home?**
license validation only. conversations stay local.

**where's data stored?**
- conversations: `~/.claude/projects/`
- settings: `~/Library/Application Support/yume/` (mac)
- database: `~/.yume/yume.db`
- plugins: `~/.yume/plugins/`
- memory v2: `~/.yume/memory/`
- agent output: `~/.yume/agent-output/`

**how to uninstall completely?**
delete app, then remove `~/.yume/` and `~/Library/Application Support/yume/`

---

## troubleshooting

**claude not responding**
1. test cli: `claude "test"`
2. check logs: settings → advanced → view logs
3. restart yume

**analytics wrong**
refresh view or try different time range

**plugins not loading**
check settings → plugins, make sure it's enabled

---

## tech

**stack?**
rust/tauri 2.9, react 19, node.js. 181+ tauri commands, ~83k lines.

**why tauri?**
smaller binary (~50mb vs electron's ~150mb), less memory, native performance.

**models?**
- claude: sonnet 4.5, opus 4.5
- gemini: 2.5 pro, 2.5 flash
- openai: gpt-5.2 codex, gpt-5.1 mini
