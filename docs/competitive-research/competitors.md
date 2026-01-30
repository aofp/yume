# Competitor Deep Dives

*Last Updated: January 29, 2026*

## IDE-Based Competitors

### Cursor

**Type**: AI-augmented IDE (VS Code fork)
**Valuation**: $29.3B (Jan 2026)
**ARR**: $1B+ (Dec 2025)
**Adoption**: 50%+ Fortune 500 companies
**Funding**: Series D $2.3B (Dec 2025)
**Price**: $20/mo Pro, $200/mo Ultra, $40/user Teams

**Key Features**:
- **Tab Completion**: Proprietary model generating at 250 tokens/sec, 28% higher accept rate
- **Agent Mode (Cmd+I)**: Plans multi-step tasks, edits multiple files, runs terminal
- **Composer**: MoE model with codebase-wide semantic search
- **Background Agents (v0.50)**: Parallel tasks via git worktrees
- **Bugbot**: Watches code changes, flags potential errors - **70%+ resolution rate, 2M+ PRs/month**
- **Bugbot Autofix (Beta)**: Auto-spawns Cloud Agent to fix found bugs
- **Debug Mode (v2.2)**: Generates hypotheses, instruments logging, verifies fixes
- **Visual Browser Editor (v2.2)**: Design + code with browser sidebar and component tree
- **Memories**: AI recalls context from previous sessions
- **Instant Grep**: All agent grep commands now instant with sidebar search
- **Multi-Agent Judging**: Auto-evaluates parallel agents, recommends best solution
- **AI Code Reviews**: Find/fix bugs in sidepanel (separate from Bugbot)
- **Plan Mode**: Inline Mermaid diagrams, send to-dos to new agents
- **Layout Customization**: 4 default layouts (agent, editor, zen, browser), Cmd+Opt+Tab
- **Security Hooks**: Semgrep (vulnerability scan), Endor Labs (malicious deps), Snyk (Evo Agent Guard)

**Strengths**:
- Market leader with massive adoption and $1B+ ARR
- VS Code extension ecosystem
- Multi-model support: GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, Grok Code
- Enterprise-ready (SOC 2, SSO)
- Proprietary speed-optimized models
- Acquired Graphite for enhanced git workflow
- Bugbot at 70%+ resolution (up from 52%)

**Weaknesses**:
- Performance issues persist (freezing, memory leaks)
- Context "forgets" mid-conversation
- AI breaks code during complex edits
- Expensive for heavy users ($200-500/mo actual costs)
- Hijacks VS Code shortcuts, auto-updates forced
- WSL integration memory issues

**Recent Updates (Jan 2026)**:
- **Bugbot v11**: Resolution rate 52% → 70%+, bugs flagged 0.4 → 0.7 per run
- **Bugbot Autofix (Beta)**: Auto-spawns Cloud Agent to fix bugs
- **Parallel Agent Judging**: Auto-recommends best solution after all agents finish
- **Security Integrations**: Semgrep, Endor Labs, Snyk hooks partnerships
- **Debug Mode**: Reproduces and fixes tricky bugs via runtime instrumentation
- **Plan Mode + Mermaid**: Inline diagrams, send todos to new agents
- **Browser Layout Editor**: Move elements, update CSS in real-time
- **Layout Customization**: 4 layouts (agent, editor, zen, browser)
- Experimenting with agents running autonomously for weeks
- Acquired Graphite (Dec 22, 2025): Enhanced git workflow

**2026 Roadmap**:
- Hooks for enterprise security/platform teams
- Proprietary models optimized for coding
- Air-gapped enterprise deployments
- Autonomous long-running agents

**Relevance to Yume**: Cursor's scale proves demand. But performance complaints validate yume's native Rust approach. Their $1B ARR shows market size, but our $21 one-time disrupts their model. Security hooks partnerships show enterprise direction.

---

### Windsurf

**Type**: AI IDE (VS Code fork)
**Price**: $15/mo Pro, $30/user Teams, $60+/user Enterprise
**Status**: Company rebranded from Codeium to Windsurf. **Acquired by OpenAI for $3B** (May 2025)

**Key Features**:
- **Cascade**: Agent combining copilot + autonomous modes (40% faster time-to-first-commit on 1M+ LOC)
- **SWE-grep**: Fast Context subagent - 2,800+ tok/s, 20x faster code search
- **Flow (2026)**: Shared workspace where AI finishes your refactors without losing context
- **Memories**: User rules + auto-generated preferences (auto-generate toggle)
- **Planning Mode (Wave 10)**: Short/long-term project understanding
- **Multi-Agent Sessions (Wave 13)**: Parallel agent workflows with git worktrees, side-by-side Cascade panes
- **Codemaps (Beta)**: Visual code mapping
- **Lifeguard (Beta)**: In-IDE bug detection
- **BYOK Claude 4**: Bring your own API key for Sonnet/Opus 4 (including thinking models)
- **Context Window Usage Meter**: Real-time context % in footer
- **Voice Input**: Speak into chat
- **Turbo Mode**: Auto-execute terminal commands
- **DeepWiki**: Hover over symbols for AI documentation
- **Vibe and Replace**: AI-powered find and replace

**Model Support (Jan 2026)**:
- GPT-5.2-Codex (4 reasoning levels: low/medium/high/xhigh)
- GPT-5.1 / GPT-5.1-Codex (variable thinking)
- Gemini 3 Flash (Gemini 3 Pro reasoning at Flash speed)
- Claude Opus 4.5 / Sonnet 4.5 (BYOK)

**Strengths**:
- Best automatic context selection (no manual @ tagging)
- Handles large codebases (millions of lines)
- Cleaner UI than Cursor
- Cheaper pricing ($15 vs $20)
- Plugins for 40+ IDEs (JetBrains, Vim, XCode)
- Priority processing for guaranteed ~50 tok/s

**Weaknesses**:
- Struggles with files >300-500 lines
- Cascade "forgets" mid-session
- Credit system discrepancies
- WSL crashing issues
- Not SOC2 compliant
- **Trustpilot skews 1-star** - wasted credits, unstable performance
- Acquisition integration (OpenAI)

**Recent Updates (Jan 2026)**:
- **Acquired by OpenAI for $3B**: Completed May 2025
- **Context Window Usage Meter**: Real-time meter in footer (REDUCES YUME ADVANTAGE)
- **GPT-5.2-Codex**: 4 reasoning effort levels
- **Gemini 3 Flash**: Pro reasoning at Flash speed
- **Voice Input**: Speak instead of typing
- **Turbo Mode**: Auto-execute terminal commands
- **DeepWiki Integration**: AI-powered code documentation on hover
- **Vibe and Replace**: AI find/replace transformations
- Wave 13: Multi-agent with git worktrees, side-by-side Cascade
- Priority Processing: 2x rate for ~50 tok/s guaranteed
- Enterprise .codeiumignore in ~/.codeium/
- MCP integrations (GitHub, Slack, Stripe, Figma)

**Recognition**: "Leader in 2025 Gartner Magic Quadrant for AI Code Assistants"

**Relevance to Yume**: Windsurf now has context meter (reduces our advantage). OpenAI acquisition may shift product direction. Voice input is interesting but niche. Their multi-agent + git worktrees approach validates yume's git branch isolation.

---

### Zed

**Type**: Native code editor (Rust)
**Price**: Free (50 prompts/mo), $20/mo Pro (500 prompts)

**Key Features**:
- 120 FPS rendering (GPUI framework)
- 58ms response time (vs 97ms VS Code)
- **Agentic Editing**: Natural language code changes with editable diff view
- **Edit Prediction**: Multi-line tab completion with Zeta (Zed's open-source model)
- **Inline Transformations**: Send selected code to LLM
- **Text Threads**: Plain text LLM interface (just an editor)
- Agent Panel: No pre-indexing required
- Real-time collaboration built-in
- Privacy-focused: Code conversations not logged/used for training
- **Dev Containers (Jan 2026)**: Initial support with Podman

**Strengths**:
- Fastest editor by far (Rust + GPU)
- Clean, minimal UI
- Open source (Zeta model too)
- Growing fast (9% Rust dev adoption)
- BYOK support + Ollama for local models
- Privacy by default
- AI commit messages respect rules files (AGENTS.md)

**Weaknesses**:
- Smaller extension ecosystem
- macOS/Linux only (Windows coming)
- Fewer AI features than Cursor
- Prompt limits on free tier

**Recent Updates (Jan 2026)**:
- **Dev Containers**: Initial support with Podman
- **Zeta Self-Hosted**: No login required for custom Zeta backends
- **AI Commit Messages**: Now respect rules files (AGENTS.md)
- Edit Prediction provider config in Settings UI
- GitHub Enterprise Copilot sign-in improved
- Ollama auto_discover setting for model filtering
- Tree view for Git panel
- SQL syntax highlighting in Python files

**Relevance to Yume**: Zed validates native Rust performance. Their Zeta model and privacy focus are differentiators. Tauri is the right architecture. Dev Containers support shows enterprise direction.

---

## Direct Claude Code GUI Competitors

### Crystal by Stravu

**Type**: Claude Code + Codex GUI (open source, Electron)
**Price**: Free (MIT License)
**GitHub**: github.com/stravu/crystal
**Website**: stravu.com/crystal

**Key Features**:
- Multi-session parallel execution with git worktree isolation
- Support for both Claude Code AND OpenAI Codex
- Compare different AI approaches to same problem
- Multi-agent session creation from single prompt
- Git merge strategy (merge to main instead of rebase)
- Slash commands and keyboard navigation

**Unique Angle**: First "IVE" (Integrated Vibe Environment) - run multiple AI agents simultaneously on isolated branches

**Strengths**:
- Multi-model support (Claude + Codex)
- Git worktree parallelization
- Compare AI approaches side-by-side
- True multi-agent orchestration

**Weaknesses vs Yume**:
- ❌ Built with Electron (heavier than Tauri)
- ❌ Primarily macOS focused
- ❌ No plugin/skills system
- ❌ No usage analytics or cost tracking
- ❌ No 5h/7-day limit tracking
- ❌ No themes, hooks, or customization
- ❌ No stream timers or @ mentions

**Relevance to Yume**: Interesting multi-model approach, but different focus. They optimize for parallel agent comparison; we optimize for single-session excellence with Claude. Yume's git branch isolation matches their worktree approach.

---

### Claude Agent Desktop (Fergana-Labs)

**Type**: Claude Agent SDK desktop wrapper
**Price**: Free (open source)
**GitHub**: github.com/Fergana-Labs/claude_agent_desktop

**Key Features**:
- BYOK (Bring Your Own Key) model
- Comprehensive file operations
- Premium skills from Claude web app (Excel, PowerPoint)
- Native desktop environment

**Strengths**:
- Claude Agent SDK based (official)
- Premium skills integration

**Weaknesses vs Yume**:
- Less mature than Yume
- Fewer features overall
- No theming, hooks, analytics

**Relevance to Yume**: Minor competitor, less feature-rich.

---

### Opcode (Formerly Claudia)

**Type**: Claude Code desktop GUI (open source, Tauri 2)
**Price**: Free (AGPL license)
**GitHub**: github.com/winfunc/opcode (19K+ stars)
**Website**: opcode.sh
**Status**: Rebranded from Claudia to Opcode (Jan 2026) with complete UI revamp

**Key Features**:
- Visual project browser (~/.claude/projects/)
- Session history with resume capability
- Custom AI agents with system prompts and permission settings
- Background agent execution (isolated processes)
- Usage analytics (cost tracking via API)
- MCP server registry
- Timeline & checkpoints with diff viewer
- CLAUDE.md editor with live preview
- Session forking from checkpoints
- SQLite local storage (fully local/self-hosted)
- **Feature parity with Claude Code 2.1** (claimed)

**Strengths**:
- Free/open source (AGPL)
- **19K+ GitHub stars** - strong community
- CLAUDE.md visual editor with live preview
- Per-agent permission controls
- No telemetry (only Claude API calls)
- Session forking capability
- Also built on Tauri 2
- Complete UI revamp (faster, cleaner)

**Weaknesses**:
- ❌ No 5h/7-day Anthropic limit tracking (only cost)
- ❌ No hook system (0 events vs yume's 9)
- ❌ No Yume Guard (built-in security hook)
- ❌ No themes (yume has 12)
- ❌ No built-in agents (yume has 4)
- ❌ No auto-compaction
- ❌ No crash recovery
- ❌ No keyboard-first design (yume has 32+)
- ❌ No @ mention system (@r, @m, folders)
- ❌ No stream timers (thinking, bash, compacting)
- ❌ No ultrathink support (Cmd+K + highlighting)
- ❌ No drag & drop tabs
- ❌ No custom commands with templates
- ❌ No virtualized message list
- ❌ No history/rollback panel
- ❌ No memory system
- ❌ No multi-provider support

**Yume vs Opcode Summary**:
| Feature | Yume | Opcode |
|---------|----------|--------|
| 5h + 7d limit tracking | ✅ | ❌ |
| Memory system (TTL, importance) | ✅ | ❌ |
| Yume Guard | ✅ Built-in security | ❌ |
| Hook system | ✅ 9 events | ❌ |
| @ mention system | ✅ @r, @m, folders | ❌ |
| Stream timers | ✅ Live durations | ❌ |
| Ultrathink support | ✅ Cmd+K + highlighting | ❌ |
| History/rollback panel | ✅ | ❌ |
| Themes | ✅ 12 | ❌ |
| Built-in agents | ✅ 4 | ❌ |
| Auto-compaction | ✅ Dynamic thresholds | ❌ |
| Crash recovery | ✅ | ❌ |
| Keyboard shortcuts | ✅ 32+ | ❌ |
| Custom commands | ✅ 5 defaults + user-defined | ❌ |
| Bash mode (!/$) | ✅ | ❌ |
| Drag & drop | ✅ | ❌ |
| Multi-provider | ✅ | ❌ |
| CLAUDE.md editor | ✅ | ✅ |
| Git diff viewer | ✅ | ✅ |
| MCP support | ✅ | ✅ |
| Checkpoints | ✅ | ✅ |
| Session forking | ❌ | ✅ |
| GitHub stars | ~100 | 19K+ |
| Price | $21 one-time | Free |

**Relevance to Yume**: Direct competitor, also Tauri-based. Opcode has community momentum (19K stars) but Yume is technically superior in 15+ categories. Their Jan 2026 rebrand and UI revamp shows active development. Session forking remains their only unique feature.

---

## Multi-Agent Orchestration Tools (New Category)

### Claude Squad

**Type**: Terminal app for managing multiple Claude Code instances
**Price**: Free / Open Source
**GitHub**: github.com/smtg-ai/claude-squad

**Key Features**:
- Manages multiple Claude Code, Codex, Gemini, Aider instances
- Uses **tmux** for isolated terminal sessions
- Uses **git worktrees** for code isolation per agent
- Each session works on its own branch
- Session state preservation

**Use Case**:
> "12 Claude agents rebuilt their entire frontend overnight—one agent refactored components, another wrote tests, a third updated documentation, and a fourth optimized performance."

**Strengths**:
- True parallel execution
- Git isolation prevents conflicts
- Works with multiple AI CLI tools
- Power user focused

**Weaknesses**:
- Terminal-only (no GUI)
- Requires tmux knowledge
- Complex setup

**Relevance to Yume**: Shows demand for multi-agent orchestration. Yume's multi-tab already provides basic parallelism; could evolve into coordinated agent swarms.

---

### OpenCode

**Type**: Open-source Claude Code alternative
**Price**: Free
**GitHub**: Open source

**Key Features**:
- Terminal AI coding agent (fresh rewrite 2025)
- Provider-agnostic (75+ LLM providers)
- Works with Claude, GPT, local models
- Mature and battle-tested

**Strengths**:
- Not locked to Anthropic
- Works with local/offline models
- Open source, customizable

**Weaknesses**:
- Less polished than Claude Code
- Smaller community

**Relevance to Yume**: Proof that terminal AI tools can be provider-agnostic. Consider multi-provider support as future differentiator.

---

### Usage Monitoring Tools

**ccusage** (github.com/ryoppippi/ccusage):
- Analyzes Claude Code usage from local JSONL files
- Daily, monthly, session reports
- 5-hour block tracking for Pro/Max billing
- Useful for flat-rate subscription users

**Claude Code Usage Monitor** (github.com/Maciek-roboblog/Claude-Code-Usage-Monitor):
- Real-time terminal monitoring
- ML-based usage predictions
- Burn rate and cost analysis
- Session limit predictions

**Relevance to Yume**: Both tools address usage visibility pain point. Yume already has analytics; could add burn rate predictions and quota alerts.

---

## CLI Competitors

### Aider

**Type**: Terminal AI pair programmer (open source)
**Price**: Free + API costs
**GitHub**: github.com/Aider-AI/aider

**Key Features**:
- **Best context fetching**: treesitter + ripgrep (outperforms VectorDB)
- Three modes: Code, Architect, Ask
- Auto-commits with sensible messages
- Works with any LLM (Claude, GPT, Gemini, DeepSeek, local via Ollama)
- Voice-to-code, image input
- 100+ language support
- **Web Browser Mode**: Run in browser, not just CLI
- **Thinking Tokens**: --thinking-tokens CLI option for thinking models
- VS Code extensions available (Aider Composer)

**Strengths**:
- Superior context understanding (treesitter + ripgrep)
- Git-native workflow
- Privacy (local, no cloud required)
- Power user friendly
- Open source
- Multi-file changes via natural language
- Now has browser and VS Code options

**Weaknesses**:
- CLI/browser-only (no native desktop)
- Steeper learning curve
- Not fully agentic (you drive, AI assists)
- Dropped Python 3.9 support

**Recent Updates (2026)**:
- Claude Sonnet 4, Opus 4 support across providers
- Gemini 2.5 Pro/Flash with thinking tokens
- GPT-5.2, GPT-4.1 (mini/nano) support
- o3-pro, o1-pro Responses API models
- New patch/editor edit formats
- --thinking-tokens CLI option
- Browser-based mode

**Relevance to Yume**: Aider's treesitter + ripgrep context is best in class. Their CLI focus means we serve different users. Consider thinking tokens display.

---

### Cline

**Type**: VS Code extension (autonomous agent)
**Price**: Free (bring your own API key)

**Key Features**:
- Plan-then-act mode
- Human-in-the-loop approvals
- Terminal command execution
- MCP tool creation
- Multi-provider support
- Cost tracking per request

**Strengths**:
- Full VS Code integration
- Transparent cost tracking
- Can create its own tools via MCP
- Open source

**Weaknesses**:
- VS Code dependent
- Can be slow with large tasks
- Less polished than Cursor

**Relevance to Yume**: Cost transparency is important. Show users per-request API costs.

---

## Extension Competitors

### GitHub Copilot

**Type**: IDE extension + GitHub integration + Cloud Agent
**Price**: $19/mo Pro, $39/mo Pro+

**Key Features**:
- **Coding Agent**: Assign issues from GitHub, Azure Boards, Raycast, Linear, Slack, Teams
- **Cloud Agent (VS 2026)**: Delegate tasks from Visual Studio, runs in GitHub Actions
- **Agent Skills**: Folders with instructions/scripts auto-loaded when relevant
- **Agent Mode + MCP**: Independent code translation, auto subtasks, tool calls, self-healing
- **Multi-Model (Jan 2026)**: GPT-5.2 GA, Claude Opus 4.5 GA, Gemini 3 Flash preview
- Custom agents for frontend, docs, testing, etc.
- Third-party agent assignment (Claude, Codex)

**Strengths**:
- Massive ecosystem and GitHub integration
- Enterprise trusted (VS 2026 GA)
- Multi-IDE + cloud execution
- Multi-model support (GPT-5.2, Claude Opus 4.5, Gemini 3 Flash)

**Weaknesses**:
- More expensive than competitors
- Less autonomous than Claude Code
- GitHub lock-in
- Cloud agent requires GitHub Actions

**Recent Updates (Jan 2026)**:
- GPT-5.2, Claude Opus 4.5, Gemini 3 Flash all GA/preview
- Agent Skills for context-aware loading
- Visual Studio 2026 GA with cloud agent
- Agent Mode with MCP support

**Relevance to Yume**: GitHub integration is table stakes. Their multi-model support and cloud agent show market direction. We stay focused on Claude excellence.

---

### Continue.dev

**Type**: Open source IDE extension + CLI
**Price**: Free

**Key Features**:
- Privacy-first (code stays local)
- Model flexibility (any provider)
- Instant completions
- Chat + multi-file understanding
- Highly customizable
- **CLI with TUI/Headless Mode** - Can run as coding agent or background agent
- **Custom Assistants** - Multiple assistants with different configurations
- **Background Agents** - Battle-tested workflows for GitHub, Sentry, Linear
- **Rules Generation** - AI can write rules for you in agent mode
- **The Notch** - Easy-access control panel for assistant management
- **Fast Apply** - Via Relace Instant Apply and Morph v0
- **OAuth for MCP** - Secure authentication for MCP servers

**Strengths**:
- Best privacy option
- Open source
- No vendor lock-in
- Great for air-gapped environments
- CLI mode competing with Claude Code
- Background agents for workflows

**Weaknesses**:
- Less polished UX
- Requires more setup
- Smaller community

**Relevance to Yume**: Privacy-conscious users are a segment. Their CLI mode shows demand for terminal-based AI coding. Consider offline/local model support.

---

### Amazon Q Developer

**Type**: AWS IDE extension
**Price**: Free tier, $19/mo Pro

**Key Features**:
- Autonomous agents for features/refactoring
- AWS resource queries from IDE
- Security scans built-in
- SOC, ISO, HIPAA, PCI compliant
- Lambda/S3 CLI generation

**Strengths**:
- Best AWS integration
- Enterprise security certifications
- Free tier generous

**Weaknesses**:
- AWS-centric
- Less general-purpose
- Smaller community

**Relevance to Yume**: Enterprise compliance matters. Document security posture if targeting enterprise.

---

## Comparison Matrix (January 2026)

| Tool | Type | Price | Agentic | Tab Complete | Multi-Agent | Native | ARR/Status |
|------|------|-------|---------|--------------|-------------|--------|------------|
| **Cursor** | IDE | $20-200/mo | Yes (background) | Yes (250 tok/s) | Yes (8+ parallel) | No (Electron) | $1B+ ARR |
| **Windsurf** | IDE | $15-60/mo | Yes (Cascade) | Yes | Yes (Wave 13) | No (Electron) | OpenAI |
| **Zed** | IDE | Free-$20/mo | Yes | Yes (Zeta) | No | Yes (Rust) | Growing |
| **Claude Code CLI** | CLI | Pro/Max | Yes (subagents) | No | Yes | Terminal | 80.9% SWE |
| **Yume** | Desktop | $21 one-time | Yes (via Claude) | No | Yes (4 agents) | Yes (Tauri/Rust) | Indie |
| **Opcode** | Desktop | Free | Yes | No | Yes | Yes (Tauri) | OSS |
| **Aider** | CLI | API costs | Partial | No | No | Terminal/Browser | OSS |
| **Cline** | Extension | API costs | Yes | No | No | No (VS Code) | OSS |
| **Copilot** | Extension | $19-39/mo | Yes (cloud) | Yes | Yes (custom) | No | Enterprise |
| **Continue** | Extension | Free | Limited | Yes | No | No | OSS |

## Feature Gap Summary (Yume vs Leaders)

| Feature | Cursor | Windsurf | Opcode | Crystal | Yume | Gap? |
|---------|--------|----------|--------|---------|----------|------|
| Plugin/Skills System | ❌ | ❌ | ❌ | ❌ | ✅ Full | **Unique** |
| Smooth UI | Issues | Good | Good | Electron | ✅ Best (native) | No |
| Tab completion | ✅ 250 tok/s | ✅ | ❌ | ❌ | ❌ (different product) | N/A - IDE feature |
| Visual diff | ✅ | ✅ | ✅ | ✅ | ✅ | No |
| Cost tracking | ❌ | Partial | ✅ | ❌ | ✅ Full | No |
| **5h/7d limit tracking** | ❌ | ❌ | ❌ | ❌ | ✅ | **Unique** |
| Checkpoints | ❌ | ❌ | ✅ | ❌ | ✅ | No |
| Auto-compact | ❌ | ❌ | ❌ | ❌ | ✅ 70%/75%/80% | **Unique** |
| Analytics | ❌ | ❌ | ✅ Cost | ❌ | ✅ Project+cost | **Advantage** |
| MCP support | ❌ | ✅ | ✅ | ❌ | ✅ Full UI | No |
| Themes | ~5 | ~3 | ❌ | ❌ | ✅ **12 themes** | **Advantage** |
| Built-in agents | ❌ | ❌ | ❌ | ❌ | ✅ **4 agents** | **Unique** |
| Custom commands | ❌ | ❌ | ❌ | ❌ | ✅ 5 defaults + custom | **Unique** |
| Hooks system | Partial | ❌ | ❌ | ❌ | ✅ 9 events | **Advantage** |
| Yume Guard | ❌ | ❌ | ❌ | ❌ | ✅ Security hook | **Unique** |
| @ mention system | ❌ | ❌ | ❌ | ❌ | ✅ @r, @m, folders | **Unique** |
| Stream timers | ❌ | ❌ | ❌ | ❌ | ✅ Live durations | **Unique** |
| Ultrathink support | ❌ | ❌ | ❌ | ❌ | ✅ Cmd+K + highlighting | **Unique** |
| History/rollback panel | ❌ | ❌ | ? | ❌ | ✅ | **Unique** |
| Bash mode (!/$) | ❌ | ❌ | ❌ | ❌ | ✅ | **Unique** |
| Crash recovery | ❌ | ❌ | ❌ | ❌ | ✅ | **Unique** |
| Keyboard shortcuts | ✅ | ✅ | ❌ | ✅ | ✅ 32+ | No |
| Drag & drop | ✅ | ✅ | ❌ | ❌ | ✅ | No |
| Light mode | ✅ | ✅ | ? | ? | ❌ (OLED focus) | Design choice |
| Memories | ✅ | ✅ | ❌ | ❌ | ✅ Memory V2 | No |
| Command palette | ✅ | ✅ | ❌ | ❌ | ✅ Cmd+P | No |
| CLAUDE.md editor | ❌ | ❌ | ✅ | ❌ | ✅ | No |
| Background agents | ✅ | ✅ | ✅ | ✅ | ✅ Via Claude | No |
| Multi-model | ❌ | ❌ | ❌ | ✅ Claude+Codex | ❌ | - |

---

## Comprehensive Comparison Chart (January 2026)

### Yume vs All Competitors - Feature Matrix

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Price** | $21 once | Pro/Max sub | $20-200/mo | $15-60/mo | Free | Free-$20/mo | Free+API |
| **Type** | Desktop GUI | CLI | IDE | IDE | Desktop GUI | IDE | CLI |
| **Native Performance** | ✅ Tauri/Rust | ❌ React Ink | ❌ Electron | ❌ Electron | ✅ Tauri | ✅ Rust | ❌ Python |
| **No Flickering** | ✅ | ❌ (700+ upvotes) | ⚠️ Issues | ⚠️ | ✅ | ✅ | N/A |
| **Multi-Tab Sessions** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Crash Recovery** | ✅ 24hr | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Context & Analytics

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **5h/7d Limit Tracking** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Token Counter** | ✅ Visual | Partial | ❌ | Partial | ✅ | ❌ | ❌ |
| **Cost Tracking** | ✅ Full | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Auto-Compaction** | ✅ 70%/75%/80% | ✅ 95% | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Usage Analytics** | ✅ project+cost | ✅ /stats heatmap | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Streak Tracking** | ❌ gap | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Peak Hour Analysis** | ❌ gap | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Input Features

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **@ Mentions** | ✅ @r/@m/folders | Partial | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ultrathink Support** | ✅ Cmd+K + rainbow | Typing only | ❌ | ❌ | ❌ | ❌ | Partial |
| **Slash Commands** | ✅ 8+ custom | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Bash Mode (!/$)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Drag & Drop** | ✅ Files+tabs | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Image Paste** | ✅ | ✅ | ✅ | ✅ | ❓ | ✅ | ✅ |

### Output & Visual

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Stream Timers** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Diff Viewer** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Files Panel** | ✅ +git status | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Git Panel** | ✅ +/- stats | ❌ | ✅ | ✅ | ❓ | ✅ | ✅ |
| **History/Rollback** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Syntax Highlighting** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Agents & Customization

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Built-in Agents** | ✅ 4 agents | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Custom Agents** | ✅ | ✅ /agents | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Themes** | ✅ 12 | ❌ terminal | ~5 | ~3 | ❌ | ✅ | ❌ |
| **Font Customization** | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Background Opacity** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Hooks & Security

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Hook Events** | ✅ 9 events | Partial | Partial | ❌ | ❌ | ❌ | ❌ |
| **Yume Guard** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP Support** | ✅ Visual UI | ✅ JSON | ❌ | ✅ | ✅ | ❌ | ❌ |

### Sessions & Checkpoints

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Checkpoints** | ✅ Visual | ✅ /rewind | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Timeline Navigator** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Session Forking** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **CLAUDE.md Editor** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

### Keyboard & UX

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Keyboard Shortcuts** | ✅ 32+ | ~10 | ✅ Many | ✅ | ❌ | ✅ | ~5 |
| **Light Mode** | ❌ (OLED focus) | ❌ | ✅ | ✅ | ❓ | ✅ | ❌ |
| **Command Palette** | ✅ Cmd+P (56 cmds) | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Memories** | ✅ Memory V2 | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |

---

### Strengths & Weaknesses Summary

#### Yume Strengths
| Strength | Details |
|----------|---------|
| **Native Performance** | Tauri/Rust, zero flickering, <50ms latency |
| **5h/7d Limit Tracking** | ONLY tool tracking actual Anthropic subscription limits |
| **$21 One-Time** | No subscriptions, no recurring fees |
| **4 Built-in Agents** | architect, explorer, implementer, guardian |
| **12 Themes** | More than any competitor |
| **9 Hook Events** | Most comprehensive hook system |
| **Yume Guard** | Built-in security blocking dangerous commands |
| **Stream Timers** | Live thinking/bash/compacting duration |
| **@ Mention System** | @r recent, @m modified, folder navigation |
| **Crash Recovery** | Auto-save with 24hr window |
| **History/Rollback** | Visual message history with rollback |
| **Ultrathink** | Cmd+K insert + rainbow highlighting |

#### Yume Weaknesses
| Weakness | Competitor Advantage |
|----------|---------------------|
| No light mode | Cursor, Windsurf, Zed have it (design choice - OLED focus) |
| No session forking | Opcode can fork from checkpoints |
| No tab completion | IDE feature (different product category) |
| No activity heatmap | CLI has year/week grid |
| No streak tracking | CLI tracks current/longest streaks |
| No peak hour analysis | CLI shows usage patterns by hour |

#### When to Choose Each Tool

| Use Case | Best Choice | Why |
|----------|-------------|-----|
| Claude Code without lag | **Yume** | Native rendering, all CLI features |
| Full IDE replacement | **Cursor** | Most features, large ecosystem |
| Budget-conscious | **Yume** ($21) or **Opcode** (free) | One-time vs subscriptions |
| Privacy-focused | **Yume** or **Zed** | No telemetry, local-first |
| Enterprise/Teams | **Cursor** or **Copilot** | SOC2, SSO, admin controls |
| Multi-model flexibility | **Aider** or **Continue** | Provider-agnostic |
| Best AI quality | **Claude Code** tools | 80.9% SWE-bench leads market |

---

## Key Insights (Updated January 2026)

1. **Native performance validated**: Cursor's memory/performance issues prove Electron struggles at scale. Zed and yume's Rust approach is correct.

2. **Tab completion is an IDE feature**: Cursor/Windsurf are code editors with inline completion. Yume is a chat interface - different product category. Not a real gap.

3. **Subscriptions cause friction**: Cursor's June pricing changes caused backlash. Yume's $21 one-time is a major differentiator vs Cursor/Windsurf. Opcode is free but has fewer features.

4. **Context memory matters**: Both Cursor and Windsurf added "Memories". Yume has Memory V2 system with per-project markdown, TTL, and importance levels - more sophisticated than competitor approaches.

5. **Checkpoint/timeline**: ✅ Both yume and Opcode have this. No longer unique, but still differentiator vs IDEs.

6. **Auto-compaction is unique**: No competitor (including Opcode) has dynamic auto-compaction thresholds (default: 70% warn, 75% auto, 80% force). Genuine yume innovation.

7. **12 themes vs ~5**: Yume has massively more theming options than any competitor. Opcode has none.

8. **4 built-in agents**: Yume agents (architect, explorer, implementer, guardian) are unique - Opcode doesn't have this.

9. **Custom commands system**: 5 defaults (/compact, /init, /commit, /review, /iterate) + user-defined commands with templates - Opcode doesn't have this.

10. **Hooks system (9 events)**: More comprehensive than any competitor's. Opcode has 0 events.

11. **5h + 7-day limit tracking**: **UNIQUE** - Only yume tracks actual Anthropic subscription limits. Opcode only does cost tracking.

12. **Keyboard-first design**: 32+ shortcuts, bash mode (!/$). Opcode lacks keyboard focus.

13. **@ mention system**: @r (recent files), @m (modified files), folder navigation. No competitor has this.

14. **Stream timers**: Live thinking/bash/compacting duration timers. No competitor shows this.

15. **Ultrathink support**: Cmd+K inserts ultrathink prefix + rainbow gradient highlighting. Unique to yume.

16. **History/rollback panel**: Visual message history with rollback capability. Unique.

17. **Crash recovery**: Auto-save every 5 min. Opcode doesn't have this.

18. **Analytics gap vs CLI**: CLI's `/stats` has heatmap, streaks, and peak hour analysis that yume lacks. But yume has per-project breakdowns and cost tracking CLI doesn't. Opportunity to combine both.

19. **Market consolidation**: OpenAI tried to buy Windsurf, Google grabbed the founders. Cursor at $29B. Small players getting squeezed.

20. **Claude Code leads benchmarks**: 80.9% SWE-bench. Being Claude-native is an advantage, not a limitation.

21. **Opcode has 19K+ stars but lacks key features**: They have community momentum but yume is technically superior in 12+ categories. Opcode's only advantage is session forking.
