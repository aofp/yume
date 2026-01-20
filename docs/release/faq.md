# faq

## general

**what is this?**
desktop app wrapping claude cli. adds tabs, auto-compaction, cost tracking.

**official anthropic product?**
no. independent.

**need anthropic subscription?**
yes. yume is just the interface.

**what's the $21 for?**
pro license: 99 tabs instead of 2. one-time payment.

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

**only 2 tabs?**
trial mode. pro is $21.

**where are conversations saved?**
`~/.claude/projects/` — same as claude cli

**what does auto-compact do?**
at 60% context: summarizes old messages, keeps recent ones and active code.

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
rust/tauri, react, node.js. 146 commands, ~51k lines.

**why tauri?**
smaller binary (~50mb vs electron's ~150mb), less memory, native performance.

**models?**
- claude: sonnet 4.5, opus 4.5
- gemini: 2.5 pro, 2.5 flash
- openai: gpt-5.2 codex, gpt-5.1 mini
