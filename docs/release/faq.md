# faq

## general

**what is this?**
desktop app wrapping claude cli. adds tabs, auto-compaction, cost tracking.

**official anthropic product?**
no. independent.

**need anthropic subscription?**
yes. yume is just the interface.

**what does it cost?**
demo is free (2 tabs, 2 panes, 1 window). pro is $4/mo (paypal subscription, cancel anytime) or $49 one-time lifetime (forever updates). pro unlocks 99 tabs, 99 panes, 99 windows.

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
demo mode (2 tabs, 2 panes, 1 window). pro is $4/mo or $49 lifetime (99 tabs, 99 panes, 99 windows).

**what happens if i cancel my monthly subscription?**
access continues until the end of the current billing period. after that, yume reverts to demo limits. you can resubscribe anytime; lifetime keys are unaffected.

**what happens if my license can't be verified?**
yume re-checks the server roughly weekly. if the network is unreachable it keeps working for 7 days (server-clock anchored). on a definitive server rejection, yume reverts to demo and shows a non-blocking banner with a retry button. your key is retained on disk so you don't need to re-enter it.

**where are conversations saved?**
`~/.claude/projects/` — same as claude cli

**what does auto-compact do?**
at a configurable dynamic threshold (default 85%): summarizes old messages, keeps recent ones and active code. warn at T-5%, auto at T%, force at T+5%. can also be turned off (the cli handles compaction too).

**will yume charge me past my subscription?**
no — turn on the 5-hour usage-limit guard (settings → general) and yume stops starting new claude turns before your 5-hour window reaches 100%, so it never spills into metered/overage billing.

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
- conversations (portable format): `~/.yume/conversations/`
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
rust/tauri 2.10, react 19, node.js. 255+ tauri commands, 3,600+ automated tests.

**why tauri?**
smaller binary (~50mb vs electron's ~150mb), less memory, native performance.

**models?**
- claude: fable 5 (default flagship), sonnet 5 (1M context), sonnet 4.6, opus 4.8, opus 4.7
- gemini: 3.1 pro preview, 3 flash preview (legacy: 2.5 pro, 2.5 flash)
- openai: gpt-5.5, gpt-5.4 mini
- kiro: auto, claude sonnet 4.5, claude haiku 4.5, glm-5

**what is /schedule?**
schedule tasks with time or event triggers. `/schedule 5m review code` runs after 5 minutes.

**what are background agents?**
up to 4 agents running in parallel, each on an isolated git branch or worktree. queue tasks, watch progress in the agent panel, merge when done. 30-minute timeout per agent, with inter-agent messaging to hand off work.

**vim mode?**
full vim keybindings for chat. normal/insert/visual/command modes. toggle in settings.

**what's the effort control?**
sets claude's effort level — five steps from low to max. lower = faster/cheaper, higher = more thorough. in the model & tools modal.
