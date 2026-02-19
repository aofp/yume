# Yume YouTube Script - The Best Claude Code GUI

**Duration:** ~12-15 minutes
**Tone:** Casual, technical, honest
**Target:** Devs frustrated with CLI, curious about better workflows

---

## HOOK (0:00 - 0:30)

so you're using claude code in the terminal and... it's fine. it works. but every time you're in the middle of typing and the screen flickers, or you lose track of how much context you've used, or you accidentally close the terminal and lose everything... you think "there has to be a better way."

there is. it's called yume. and after using it for a while, going back to the CLI feels like going back to vim after using a proper IDE. let me show you why.

---

## INTRO - WHAT IS YUME (0:30 - 1:30)

yume is a native desktop app that wraps claude code. but calling it a "wrapper" is underselling it. it's more like... what claude code would be if anthropic had built a desktop app instead of a CLI.

it's built with tauri - that's rust on the backend, react on the frontend. why does that matter? because it means native performance. no electron bloat. the app uses about 145mb of ram idle. compare that to cursor or windsurf eating up a gig or more.

and here's the thing - it's free. not "free tier with limits" free. actually free. there's a pro version for $29 if you want more tabs, but all the features are there in the free version.

---

## THE CORE PROBLEM WITH CLI (1:30 - 3:00)

let me be real about what's wrong with the terminal experience:

**the flickering.** you're typing, claude's responding, and the whole screen refreshes. it's better than it used to be, but it's still there. in yume? zero flicker. it's native rendering - the text just... appears. smoothly.

**input lag.** ever been in a long session and noticed your typing getting sluggish? that's the terminal struggling. yume maintains sub-100ms response times consistently. doesn't matter if you're 50 messages deep.

**losing your place.** the CLI scrolls. a lot. you're reading something, claude outputs more text, and now you've lost where you were. yume uses virtualized scrolling - basically it only renders what you can see, so even sessions with thousands of messages stay smooth. and it doesn't yank the scroll position away from you while you're reading.

**no visibility.** in the CLI, you have to run `/usage` to see your tokens. `/context` to see how full you are. in yume, there's a bar at the top. always visible. you always know where you stand.

---

## FEATURE DEEP DIVE: CONTEXT MANAGEMENT (3:00 - 5:00)

this is where yume really shines. let's talk about how context actually works.

claude has a context window - 200k tokens. as you chat, you fill it up. when it's full, you're stuck. the CLI's answer? you run `/compact` manually. maybe you remember to do it, maybe you don't.

yume has **dynamic auto-compaction**. here's how it works:

there's a threshold - default is 75%. when you hit 70% (that's the threshold minus 5%), you get a warning. visual indicator, can't miss it. at 75%, yume automatically triggers compaction on your next message. and if somehow you hit 80% (threshold plus 5%), it force-compacts immediately.

the compaction itself uses claude to summarize your conversation - preserves the important stuff, ditches the noise. and here's the clever bit: when compaction happens, yume emits the result on both the old session channel and the new one. so the UI stays in sync even though you're technically in a new session underneath.

you can configure all of this. want to compact earlier? later? turn it off entirely? it's in settings.

---

## FEATURE DEEP DIVE: THE 4 AGENTS (5:00 - 7:00)

yume comes with four built-in agents. not plugins you have to install - they're just there.

**yume-architect** - you use this before doing anything complex. it plans. breaks tasks into steps. identifies dependencies and risks. it uses the TodoWrite tool to track everything.

**yume-explorer** - this one's read-only. it searches the codebase, reads files, builds understanding. it runs on sonnet by default (cheaper, faster) and can't modify anything. use it to gather context before you start coding.

**yume-implementer** - small, focused edits. this isn't the agent for "rewrite the whole module." it's for "change this function, add this parameter." deliberate, incremental changes.

**yume-guardian** - the reviewer. after you make changes, this one checks for bugs, security issues, performance problems. it also handles domain-specific stuff like writing tests, updating docs, devops tasks.

here's how they work under the hood: yume writes these as markdown files to `~/.claude/agents/`. that's the same directory claude code uses for custom agents. so they're available everywhere - in yume, in the CLI, wherever. when you switch models in yume, it re-syncs the agent files with the new model. when you close yume, it cleans them up (but only if it's the last yume instance running - it tracks PIDs).

the agents get injected into your workflow automatically via orchestration prompts. when you start a session, yume appends instructions that tell claude: "for complex tasks, use architect to plan, explorer to search, guardian after changes." you don't have to remember to invoke them - the workflow just... works.

---

## FEATURE DEEP DIVE: BACKGROUND AGENTS (7:00 - 8:30)

now this is cool. you can run agents in the background while you keep working.

say you want the architect to plan something, but you don't want to wait. queue it as a background agent. yume manages a queue - up to 4 running concurrently with a 30-minute timeout.

each background agent can optionally get its own git branch. yume creates it automatically: `yume-async-architect-{id}`. stashes your uncommitted changes first, creates the branch, runs the agent. when it's done, you can review the diff, merge it in, or toss it.

the output goes to `~/.yume/agent-output/`. you can check on progress, see what's happening.

and here's an important implementation detail: background agents don't mess with your main session's streaming state. this sounds obvious but it's not. in the server, there's specific logic that says "if this result came from a background agent or a subagent (has a parent_tool_use_id), don't touch the main streaming flag." so you can be mid-conversation, have agents running in the background, and nothing gets confused.

---

## FEATURE DEEP DIVE: THINKING STREAMING (8:30 - 9:30)

this one's kind of a flex. yume shows you claude's extended thinking in real-time.

when you trigger ultrathink (cmd+k inserts the prompt, or just say "think deeply"), claude goes into extended thinking mode. in the CLI, you just... wait. maybe you see a spinner. you have no idea what's happening.

in yume, you watch the thinking stream in. live. as claude reasons through the problem. this isn't even something the CLI does - it's a yume exclusive.

why does this matter? because sometimes you can see where claude's going wrong mid-thought. you can interrupt, redirect. or you just get insight into how it's approaching your problem.

---

## FEATURE DEEP DIVE: ROLLBACK & HISTORY (9:30 - 10:30)

so claude made changes you don't like. in the CLI, you're kind of stuck. maybe you can undo in your editor. maybe you committed already. good luck.

yume tracks **restore points**. every time claude uses Edit or Write, yume captures the file state before the change. original content, modification time, everything.

click the history button, you see all your messages listed. each one shows how many lines changed (+added/-removed). click a message to roll back to that point:

1. yume collects all file snapshots after that message
2. checks for conflicts - has something else modified these files? another tab? external editor?
3. shows you what's about to be restored
4. restores the files
5. truncates the conversation
6. puts the message text back in your input so you can re-prompt differently

it's like git, but for your conversation.

---

## OTHER STUFF WORTH MENTIONING (10:30 - 12:00)

rapid fire on other features:

**5h and 7-day limit tracking** - anthropic has rate limits. nobody else shows you where you stand on these. yume has visual bars.

**18 themes** - 12 dark oled-optimized with pure blacks + 6 light themes. cursor has like 5. windsurf has 3.

**crash recovery** - snapshots every 5 minutes. close the app wrong, lose power, whatever - your session's there when you come back. 24 hour retention.

**hooks system** - 9 events you can hook into. user_prompt_submit, pre_tool_use, context_warning, compaction_trigger are active. run bash scripts, python, node, powershell. block actions, modify them, or just observe.

**mcp support** - model context protocol. connect external tools, databases, apis.

**32+ keyboard shortcuts** - cmd+p for command palette, cmd+t new tab, cmd+k ultrathink, everything you'd expect.

**voice dictation** - f5 to toggle. native speech-to-text.

**plugin system** - commands, agents, hooks, skills, mcp configs. all in markdown files. drop them in `~/.yume/plugins/`.

**skills** - auto-inject context based on triggers. working with python files? skill triggers, adds python-specific context. working with your api? triggers on keywords, adds your api docs.

---

## WHY NOT CURSOR/WINDSURF/ETC (12:00 - 13:00)

quick comparison:

**cursor** - it's an IDE. if you want an IDE, use it. but if you already have your editor setup and just want a claude interface, cursor is bloat. also $240+/year.

**windsurf** - similar deal. IDE with AI built in. pricing changes constantly.

**opcode** - closest competitor for pure claude gui. but no memory system, no limit tracking, no agents, no themes, no hooks, no crash recovery. and yume's free.

**aider** - command line tool. great for what it is, but it's still command line.

yume is the "I want claude code but better" option. all the power, native performance, 20+ features you can't get anywhere else.

---

## CLOSING (13:00 - 14:00)

look, I'm not saying the CLI is bad. it works. anthropic did good work making it usable.

but yume is what happens when you take that foundation and ask "what if we actually built a proper interface?" native rendering. persistent sessions. visible context. automatic compaction. background agents with git isolation. thinking streaming. rollback. the list goes on.

it's free. download it, try it. worst case you go back to the CLI. but I don't think you will.

link's in the description. that's yume.

---

## B-ROLL SUGGESTIONS

- side-by-side of CLI flickering vs yume smooth rendering
- context bar filling up, warning appearing, auto-compact triggering
- spawning a background agent, watching it create a branch
- thinking streaming in real-time
- rollback panel, clicking to restore
- command palette with all shortcuts
- settings showing hooks, skills, plugins
- analytics dashboard with usage stats

---

## TECHNICAL CALLOUTS FOR NERDS

sprinkle these in where relevant:

- "tauri 2.0 with rust backend, react 19 frontend"
- "virtualized scrolling via react-virtuoso"
- "bounded buffers - 100kb max, auto-drains on overflow"
- "process registry with lock ordering to prevent deadlocks"
- "separate channels for stdout/stderr/completion with tokio tasks"
- "xor cipher for license storage with file backup at ~/.yume/license.json"
- "agents synced as yaml frontmatter markdown to ~/.claude/agents/"
- "700ms debounce on macos, 2000ms on windows for streaming state"
