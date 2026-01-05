# User Sentiment Analysis

*Aggregated from Reddit, Hacker News, forums, and reviews*

## Claude Code CLI Complaints

### Top Issues (Ranked by Frequency)

1. **Performance Degradation** (Critical)
   - "Claude had become significantly dumber… ignored its own plan and messed up the code"
   - Users report model quality decline since August 2025
   - Anthropic confirmed bugs in Sonnet 4 and Haiku 3.5

2. **Context Loss** (Critical)
   - "Severe context loss. In the middle of a complex task, Claude will suddenly forget what it was doing"
   - Context bleed between sessions
   - Context rot over long conversations

3. **Usage Limits** (High)
   - Weekly limits added August 28, 2025
   - 5-hour reset window + weekly caps
   - "Dynamic quality reduction" when system is busy

4. **Trust Issues** (High)
   - AI delivers incomplete work with "100% confidence"
   - "Complete codebase analysis" when only 21% analyzed
   - Users use words like "fraud," "scam," "gaslighting"

5. **TUI Rendering** (High) - *Yurucode's opportunity*
   - Flickering, lag, input delays
   - 10+ second waits for single characters
   - IME broken for Japanese/Chinese

### Anthropic's Response
> "We never intentionally degrade model quality. The issues were attributed to unrelated bugs."

---

## Cursor Complaints

### Top Issues

1. **AI Reliability**
   - "Cursor terrible since the last updates"
   - AI "randomly breaking code for no reason"
   - "Going rogue" - ignores instructions

2. **Pricing Confusion**
   - Fast vs slow queries unclear
   - Surprise bills ($71 in one day reported)
   - Rate limits make tool "all but unusable"

3. **Support Bot Scandal** (April 2025)
   - Support bot "Sam" invented fake policy
   - Users forcibly logged out of multiple machines
   - Reddit threads deleted, users banned
   - "No such policy existed"

4. **Large Project Performance**
   - "Doesn't perform well on large projects"
   - Makes changes to code user didn't ask for
   - Multi-file operations unreliable

5. **Customer Support**
   - "Slow or non-existent"
   - Allegedly deletes critical posts
   - Bans users from subreddit

---

## Industry-Wide Frustrations

### The "66% Problem"
> "The number-one frustration is AI solutions that are 'almost right, but not quite'"

- 66% cite "almost right" code as biggest issue
- 45% say debugging AI code takes more time
- 46% don't trust AI output accuracy (up from 31%)

### The Productivity Paradox
METR study findings:
- Developers using AI were **19% slower**
- Yet believed they were 24% faster
- "AI makes them slower" - actual measured result

### Code Quality Concerns
- 4x more code cloning with AI
- 1.7x more issues in AI-assisted PRs
- 322% more privilege escalation paths
- 40% increase in secrets exposure
- AI commits merged 4x faster (bypassing review)

### Context & Standards
- 44% blame context issues for quality problems
- 40% cite inconsistency with team standards
- AI "resets to new hire knowledge" each session

---

## Positive Sentiment Themes

Despite complaints, adoption is high because:

1. **Time Savings** (when it works)
   - 68% save 10+ hours/week
   - Good for boilerplate, repetitive tasks
   - Helpful for learning new codebases

2. **Specific Use Cases**
   - Code explanations
   - Documentation generation
   - Test writing
   - Regex/shell commands

3. **Tool Preference Patterns**
   - Cursor: "Best for IDE-integrated workflows"
   - Claude Code: "Best for terminal power users"
   - Aider: "Best for git-centric workflows"

---

## Sentiment by Tool

| Tool | Reddit Sentiment | Common Praise | Common Complaint |
|------|------------------|---------------|------------------|
| Claude Code CLI | Mixed/Declining | Powerful, autonomous | TUI lag, context loss |
| Cursor | Mixed/Declining | Familiar VS Code | Pricing, reliability |
| Windsurf | Positive | Clean UX, fast | Less mature ecosystem |
| Aider | Positive | Context fetching, git | CLI learning curve |
| Copilot | Stable | Ecosystem, integration | Less autonomous |
| Cline | Positive | Transparency, OSS | VS Code dependent |

---

## Yurucode Opportunity Analysis

### Pain Points We Solve

| User Complaint | How Yurucode Helps |
|----------------|-------------------|
| TUI flickering/lag | Native desktop rendering |
| Input delays | No terminal abstraction |
| IME broken | Native OS input handling |
| Terminal corruption | Self-contained app |
| Context switching | Single unified interface |
| Session management | Visual project/session UI |

### Pain Points We Can't Solve (Model-Level)
- Context loss (Claude limitation)
- "Almost right" code (model capability)
- Usage limits (Anthropic policy)
- Quality degradation (API-level)

### Pain Points We Could Address

| Issue | Potential Feature |
|-------|-------------------|
| Cost confusion | Real-time cost tracking |
| Surprise bills | Budget alerts/limits |
| Trust issues | Confidence indicators |
| Large projects | Better context UI |
| Review burden | Built-in diff review |

---

## Key Quotes

### Claude Code
> "We're not stupid. We document our prompts, we version our code, we know when outputs change. Telling us it's in our heads is insulting."

### Cursor
> "Is it my idea or is Cursor terrible since the last updates?" - Reddit user

### Industry
> "66% of devs spend more time fixing 'almost-right' AI code than they saved"

### Opportunity
> "The biggest single frustration is dealing with AI solutions that are almost right, but not quite"

---

## Sources

- [Devs Cancel Claude Code En Masse](https://www.aiengineering.report/p/devs-cancel-claude-code-en-masse)
- [Anthropic Confirms Technical Bugs](https://the-decoder.com/anthropic-confirms-technical-bugs-after-weeks-of-complaints-about-declining-claude-code-quality/)
- [Cursor AI Support Bot Controversy](https://www.theregister.com/2025/04/18/cursor_ai_support_bot_lies/)
- [State of AI Code Quality 2025](https://www.qodo.ai/reports/state-of-ai-code-quality/)
- [METR AI Productivity Study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
