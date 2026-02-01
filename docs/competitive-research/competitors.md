# Competitor Deep Dives

*Last Updated: January 30, 2026*

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
- **Background Agents (v0.50)**: Parallel tasks via git worktrees, up to 8 parallel agents
- **Cloud Agents**: Push local conversation to cloud with `&` prefix, continue on web/mobile
- **Bugbot v11**: Watches code changes, flags potential errors - **70%+ resolution rate, 2M+ PRs/month**
- **Bugbot Autofix (Beta)**: Auto-spawns Cloud Agent to fix found bugs
- **Debug Mode (v2.2)**: Generates hypotheses, instruments logging, verifies fixes
- **Visual Browser Editor (v2.2)**: Design + code with browser sidebar and component tree
- **Plan Mode**: Inline Mermaid diagrams, send to-dos to new agents, `/plan` or `--mode=plan`
- **Memories**: AI recalls context from previous sessions
- **Instant Grep**: All agent grep commands now instant with sidebar search
- **Multi-Agent Judging**: Auto-evaluates parallel agents, recommends best solution
- **AI Code Reviews**: Find/fix bugs in sidepanel (separate from Bugbot)
- **Layout Customization**: 4 default layouts (agent, editor, zen, browser), Cmd+Opt+Tab
- **Security Hooks**: Semgrep (vulnerability scan), Endor Labs (malicious deps), Snyk (Evo Agent Guard)
- **Dynamic Context Discovery**: Fewer details up front, agent pulls context on its own
- **Sharable Transcripts**: Read-only agent conversation transcripts for PRs
- **Billing Groups**: Fine-grained usage visibility for organizations

**Strengths**:
- Market leader with massive adoption and $1B+ ARR
- VS Code extension ecosystem
- Multi-model support: GPT-5.2, Claude Opus 4.5, Gemini 3 Pro, Grok Code
- Enterprise-ready (SOC 2, SSO)
- Proprietary speed-optimized models
- Acquired Graphite for enhanced git workflow
- Bugbot at 70%+ resolution (up from 52%)
- Agent-first architecture in 2.0 (less "VS Code with AI", more "agent workbench")

**Weaknesses**:
- Performance issues persist (freezing, memory leaks)
- Context "forgets" mid-conversation
- AI breaks code during complex edits
- Expensive for heavy users ($200-500/mo actual costs)
- Hijacks VS Code shortcuts, auto-updates forced
- WSL integration memory issues
- Credit-based pricing caused controversy (June 2025)

**Recent Updates (Jan 2026)**:
- **Cursor 2.0/2.2**: Agent-first redesign, Debug Mode, Plan Mode
- **Bugbot v11**: Resolution rate 52% → 70%+, bugs flagged 0.4 → 0.7 per run
- **Bugbot Autofix (Beta)**: Auto-spawns Cloud Agent to fix bugs
- **Parallel Agent Judging**: Auto-recommends best solution after all agents finish
- **Security Integrations**: Semgrep, Endor Labs, Snyk hooks partnerships
- **Debug Mode**: Reproduces and fixes tricky bugs via runtime instrumentation
- **Plan Mode + Mermaid**: Inline diagrams, send todos to new agents
- **Cloud Agents**: `&` prefix pushes work to cloud, continue on web/mobile
- **Dynamic Context Discovery**: Agent pulls relevant context autonomously
- Experimenting with agents running autonomously for weeks
- Acquired Graphite (Dec 22, 2025): Enhanced git workflow

**2026 Roadmap**:
- Hooks for enterprise security/platform teams
- Proprietary models optimized for coding
- Air-gapped enterprise deployments
- Autonomous long-running agents

**Relevance to Yume**: Cursor's scale proves demand. But performance complaints validate yume's native Rust approach. Their $1B ARR shows market size, but our freeware model disrupts their subscriptions. Security hooks partnerships show enterprise direction. Cloud agents show async execution trend yume already supports.

---

### Windsurf (Now Part of Cognition AI)

**Type**: AI IDE (VS Code fork)
**Price**: $15/mo Pro, $30/user Teams, $60+/user Enterprise
**Status**: **Split acquisition (July 2025)**: Google DeepMind acquihired CEO + top engineers ($2.4B licensing), Cognition acquired product/brand/IP

**Key Features**:
- **Cascade Engine**: Agent combining copilot + autonomous modes (40% faster time-to-first-commit on 1M+ LOC)
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
- **Enterprise compliance**: FedRAMP High, HIPAA (post-Cognition)

**Weaknesses**:
- Struggles with files >300-500 lines
- Cascade "forgets" mid-session
- Credit system discrepancies
- WSL crashing issues
- **Trustpilot skews 1-star** - wasted credits, unstable performance
- Acquisition integration uncertainty

**Recent Updates (Jan 2026)**:
- **Cognition Acquisition**: Cognition acquired product, brand, IP, remaining team
- **Google DeepMind Acquihire**: CEO Varun Mohan + top engineers + $2.4B licensing deal
- **OpenAI Deal Collapsed**: $3B acquisition failed due to Microsoft IP rights conflict
- **FedRAMP High + HIPAA**: Enterprise compliance certifications
- **Context Window Usage Meter**: Real-time meter in footer
- **GPT-5.2-Codex**: 4 reasoning effort levels
- **Gemini 3 Flash**: Pro reasoning at Flash speed
- **Voice Input**: Speak instead of typing
- **Turbo Mode**: Auto-execute terminal commands
- **DeepWiki Integration**: AI-powered code documentation on hover
- Wave 13: Multi-agent with git worktrees, side-by-side Cascade

**Recognition**: "Leader in 2025 Gartner Magic Quadrant for AI Code Assistants"

**Relevance to Yume**: Windsurf's split acquisition shows market volatility. OpenAI's failed bid proves AI coding tools are strategic assets. Cognition's focus on enterprise compliance shows direction. Their context meter reduces yume's advantage there, but we have more comprehensive analytics.

---

### Zed

**Type**: Native code editor (Rust)
**Price**: Free (50 prompts/mo), $20/mo Pro (500 prompts)
**GitHub**: 50K+ stars

**Key Features**:
- 120 FPS rendering (GPUI framework)
- 58ms response time (vs 97ms VS Code)
- **ACP (Agent Client Protocol)**: Open standard for connecting any AI agent to any editor
- **Agentic Editing**: Natural language code changes with editable diff view
- **Edit Prediction**: Multi-line tab completion with Zeta (Zed's open-source model)
- **Inline Transformations**: Send selected code to LLM
- **Text Threads**: Plain text LLM interface (just an editor)
- **External Agents**: Claude Code, Codex, Gemini CLI as ACP agents
- Agent Panel: No pre-indexing required
- Real-time collaboration built-in (CRDTs)
- Privacy-focused: Code conversations not logged/used for training
- **Dev Containers (Jan 2026)**: Initial support with Podman

**Strengths**:
- Fastest editor by far (Rust + GPU, 10x faster startup than VS Code)
- Clean, minimal UI
- Open source (Zeta model too)
- Growing fast (9% Rust dev adoption)
- BYOK support + Ollama for local models
- Privacy by default
- AI commit messages respect rules files (AGENTS.md)
- **ACP ecosystem**: JetBrains, Neovim, Emacs, marimo adopting

**Weaknesses**:
- Smaller extension ecosystem
- macOS/Linux only (Windows recently stable)
- Fewer AI features than Cursor
- Prompt limits on free tier

**Recent Updates (Jan 2026)**:
- **ACP Registry**: Official registry with JetBrains partnership
- **Dev Containers**: Initial support with Podman
- **Codex in Zed**: Codex now available as ACP agent
- **Zeta Self-Hosted**: No login required for custom Zeta backends
- **AI Commit Messages**: Now respect rules files (AGENTS.md)
- Edit Prediction provider config in Settings UI
- GitHub Enterprise Copilot sign-in improved
- Ollama auto_discover setting for model filtering
- Tree view for Git panel
- SQL syntax highlighting in Python files

**ACP Ecosystem Adoption**:
- JetBrains: Official ACP Registry integration
- Neovim: 2 plugins support ACP
- Emacs: agent-shell plugin
- marimo: Python notebook support
- Eclipse: Prototype implementation
- Aider: ACP implementation underway

**Relevance to Yume**: Zed validates native Rust performance. Their ACP protocol could become standard - consider implementing. Zed for AI power users who prefer terminal-first workflows. Tauri is the right architecture. Dev Containers support shows enterprise direction.

---

## Direct Claude Code GUI Competitors

### Opcode (Formerly Claudia)

**Type**: Claude Code desktop GUI (open source, Tauri 2)
**Price**: Free (AGPL license)
**GitHub**: github.com/winfunc/opcode (19K+ stars)
**Website**: opcode.sh
**Status**: Rebranded from Claudia to Opcode (Jan 2026) with complete UI revamp
**Backed by**: Asterisk Labs (Y Combinator startup)

**Key Features**:
- Visual project browser (~/.claude/projects/)
- Session history with resume capability
- Custom AI agents with system prompts and permission settings
- Background agent execution (isolated processes)
- Usage analytics (cost tracking via API)
- MCP server registry
- Timeline & checkpoints with diff viewer
- CLAUDE.md editor with live preview and syntax highlighting
- Session forking from checkpoints
- SQLite local storage (fully local/self-hosted)
- **Sandbox security**: Linux seccomp and macOS Seatbelt
- **Feature parity with Claude Code 2.1** (claimed)
- No telemetry (only Claude API calls)

**Strengths**:
- Free/open source (AGPL)
- **19K+ GitHub stars** - strong community
- CLAUDE.md visual editor with live preview
- Per-agent permission controls
- Also built on Tauri 2
- Complete UI revamp (faster, cleaner)
- Session forking capability
- Sandbox security built-in

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
- ❌ No orchestration flow (auto-agent selection)
- Currently requires building from source (no native installers yet)

**Yume vs Opcode Summary**:
| Feature | Yume | Opcode |
|---------|----------|--------|
| 5h + 7d limit tracking | ✅ | ❌ |
| Memory system (TTL, importance) | ✅ Memory V2 | ❌ |
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
| Orchestration flow | ✅ Auto-agent selection | ❌ |
| CLAUDE.md editor | ✅ | ✅ |
| Git diff viewer | ✅ | ✅ |
| MCP support | ✅ | ✅ |
| Checkpoints | ✅ | ✅ |
| Session forking | ✅ Cmd+Shift+D | ✅ |
| Sandbox security | ❌ | ✅ |
| GitHub stars | ~100 | 19K+ |
| Price | Free | Free |

**Relevance to Yume**: Direct competitor, also Tauri-based. Opcode has community momentum (19K stars) but Yume is technically superior in 15+ categories. Their Jan 2026 rebrand and UI revamp shows active development. Sandbox security is their advantage (yume has session forking via Cmd+Shift+D). Native installers coming soon will increase competition.

---

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

### Claude Canvas

**Type**: Terminal-based Claude Code UI
**Price**: Free (open source)
**GitHub**: github.com/PureUsername/claude-canvas

**Key Features**:
- Uses tmux to split terminal into panes
- Gives Claude an external "monitor" for interactive content
- Stays entirely in terminal (no desktop app)
- Visual content display within CLI

**Strengths**:
- Zero installation (just tmux)
- Terminal-native workflow
- Lightweight

**Weaknesses vs Yume**:
- ❌ No GUI
- ❌ Requires tmux knowledge
- ❌ Limited features
- ❌ No persistence

**Relevance to Yume**: Alternative approach for terminal purists. Different user segment.

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

## CLI Competitors

### OpenCode

**Type**: Open-source Claude Code alternative
**Price**: Free (open source)
**GitHub**: 48K+ stars
**Website**: opencode.ai

**Key Features**:
- Terminal AI coding agent with LSP support
- **Provider-agnostic**: 75+ LLM providers
- Works with Claude, GPT, local models (Ollama)
- Multi-session capability
- Shareable links
- Desktop app, IDE extensions, CLI
- **ACP Support**: Works as ACP agent in Zed, JetBrains

**Strengths**:
- Not locked to Anthropic
- Works with local/offline models
- Open source, customizable
- Free ($0 vs Claude Code's subscriptions)
- Large community (48K stars)

**Weaknesses**:
- Less polished than Claude Code
- Lower benchmark scores (varies by provider)
- More setup required

**Relevance to Yume**: Proof that terminal AI tools can be provider-agnostic. Competition for yume-cli's multi-provider approach. Consider ACP support.

---

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
- **ACP Implementation**: In development

**Model Support (2026)**:
- Claude Sonnet 4, Opus 4 across providers
- Gemini 2.5 Pro/Flash with thinking tokens
- GPT-5.2, GPT-4.1 (mini/nano)
- o3-pro, o1-pro Responses API models
- Grok-3 beta models

**New CLI Features**:
- `--auto-accept-architect`: Auto-accept architect edits
- `--add-gitignore-files`: Add gitignored files to scope
- `--copy-paste` mode, `/copy-context` command
- `--api-key provider=key` for setting API keys
- `/voice` lets you edit transcribed text before sending
- Token count progress during repo map updates
- Auto-refresh GitHub Copilot tokens

**Strengths**:
- Superior context understanding (treesitter + ripgrep)
- Git-native workflow
- Privacy (local, no cloud required)
- Power user friendly
- Open source, self-developing (75% of own code)
- Multi-file changes via natural language
- Now has browser and VS Code options

**Weaknesses**:
- Steeper learning curve
- Not fully agentic (you drive, AI assists)
- Two LLM requests in architect mode increases cost
- Dropped Python 3.9 support

**Relevance to Yume**: Aider's treesitter + ripgrep context is best in class. Their CLI focus means we serve different users. Consider thinking tokens display. ACP development shows ecosystem convergence.

---

### Gemini CLI

**Type**: Google's open-source AI coding agent
**Price**: Free (60 req/min, 1000 req/day with personal Google account)
**GitHub**: github.com/google-gemini/gemini-cli
**License**: Apache 2.0

**Key Features**:
- ReAct loop with built-in tools
- **1M token context window**
- Built-in tools: Google Search grounding, file ops, shell commands, web fetch
- MCP support for custom integrations
- System prompts via GEMINI.md
- **ACP Reference Implementation**: Default agent in Zed

**Recent Updates (Jan 2026)**:
- **Gemini 3 Flash**: 78% SWE-bench Verified (outperforms 2.5 series and 3 Pro)
- Less than 1/4 cost of Gemini 3 Pro
- Agent mode in VS Code powered by Gemini CLI
- High-frequency terminal workflow optimization

**Strengths**:
- Free tier is generous
- 1M context window
- Google Search grounding
- Open source (Apache 2.0)
- Terminal-first design

**Weaknesses**:
- Gemini-only (no model flexibility)
- Less mature than Claude Code
- Google account required

**Relevance to Yume**: Free competition to Claude CLI subscriptions. yume-cli already supports Gemini. ACP reference shows Google's commitment to open standards.

---

### Cline

**Type**: VS Code extension (autonomous agent)
**Price**: Free (bring your own API key)
**GitHub**: github.com/cline/cline (2.4M+ VS Code installs)

**Key Features**:
- Plan-then-act mode
- Human-in-the-loop approvals
- Terminal command execution
- MCP tool creation
- Multi-provider support
- Cost tracking per request
- **Background Edits**: Edit files without opening diff view
- **Deep Planning**: Multi-step reasoning with verification

**Recent Updates (Jan 2026)**:
- **Background Edits (Experimental)**: v3.47 - edit without diff view
- **Keyboard Shortcut**: Cmd+' to focus Cline
- **Lightbulb Actions**: "Add to Cline", "Explain", "Improve"
- Gemini 2.5 Flash Preview with 1M context
- GPT-5 context window fixes (272K limit)
- Go language deep-planning support
- **JetBrains plugin**: Multi-platform expansion
- New providers: Vercel AI Gateway, Z AI (GLM-4.5)
- MiniMax M2.1 as free model

**Strengths**:
- Full VS Code integration
- Transparent cost tracking
- Can create its own tools via MCP
- Open source
- 2.4M installs (top agent-specific VS Code extension)
- Multi-platform (VS Code, CLI, JetBrains)

**Weaknesses**:
- VS Code dependent (for primary use)
- Can be slow with large tasks
- Less polished than Cursor

**Relevance to Yume**: Cost transparency is important. Their multi-platform expansion validates desktop app approach. Background edits feature interesting.

---

## Extension Competitors

### GitHub Copilot

**Type**: IDE extension + GitHub integration + Cloud Agent
**Price**: Free tier, $10/mo Pro, $39/mo Pro+, $39/user Enterprise

**Key Features**:
- **Coding Agent**: Assign issues from GitHub, Azure Boards, Raycast, Linear, Slack, Teams
- **Cloud Agent (VS 2026)**: Delegate tasks from Visual Studio, runs in GitHub Actions
- **Agent Skills**: Folders with instructions/scripts auto-loaded when relevant
- **Agent Mode + MCP**: Independent code translation, auto subtasks, tool calls, self-healing
- **Multi-Model (Jan 2026)**: GPT-5.2 GA, Claude Opus 4.5 GA, Gemini 3 Flash preview, GPT-5 mini, GPT-4.1
- Custom agents for frontend, docs, testing, etc.
- Third-party agent assignment (Claude, Codex)
- **web_fetch tool**: Retrieve URL content as markdown
- **Ctrl+T**: Toggle model reasoning visibility

**CLI Enhancements (Jan 2026)**:
- Agent-run commands excluded from Bash/PowerShell history
- URL access control in ~/.copilot/config
- GPT-5 mini and GPT-4.1 included in subscription (no premium requests)

**Strengths**:
- Massive ecosystem and GitHub integration
- Enterprise trusted (VS 2026 GA)
- Multi-IDE + cloud execution
- Multi-model support (GPT-5.2, Claude Opus 4.5, Gemini 3 Flash)
- Free tier available

**Weaknesses**:
- 64K token context limit (can't be increased)
- Rate limits on intensive use
- GitHub lock-in
- Cloud agent requires GitHub Actions
- Model deprecations coming Feb 2026

**Recent Updates (Jan 2026)**:
- GPT-5.2, Claude Opus 4.5, Gemini 3 Flash all GA/preview
- GPT-5 mini, GPT-4.1 included in subscription
- Agent Skills for context-aware loading
- Visual Studio 2026 GA with cloud agent
- Agent Mode with MCP support
- web_fetch tool for URL content

**Relevance to Yume**: GitHub integration is table stakes. Their multi-model support and cloud agent show market direction. Model deprecations show rapid change. We stay focused on Claude excellence.

---

### Continue.dev

**Type**: Open source IDE extension + CLI
**Price**: Free
**GitHub**: 26K+ stars

**Key Features**:
- Privacy-first (code stays local)
- Model flexibility (any provider)
- Instant completions
- Chat + multi-file understanding
- Highly customizable
- **CLI with TUI/Headless Mode** - Can run as coding agent or background agent
- **Custom Assistants** - Multiple assistants with different configurations
- **Background Agents** - Battle-tested workflows for GitHub, Sentry, Linear, Snyk
- **Rules Generation** - AI can write rules in agent mode
- **The Notch** - Easy-access control panel for assistant management
- **Fast Apply** - Via Relace Instant Apply and Morph v0
- **OAuth for MCP** - Secure authentication for MCP servers
- **Shell Mode**: Execute commands directly through Continue

**Recent Updates (Jan 2026)**:
- GPT-5 support with search and replace
- Tool calling with Devstral
- AST-based edits for multi-hundred-line files
- Mercury-coder-small (diffusion-based, instant autocomplete)
- `--id` option for connecting to existing remote agents
- Automated PR code review
- GitHub workflow auto-labeling
- Documentation automation guide
- Git branch display in CLI
- Pause/resume Continue sessions

**Strengths**:
- Best privacy option
- Open source
- No vendor lock-in
- Great for air-gapped environments
- CLI mode competing with Claude Code
- Background agents for workflows
- 100% air-gapped option

**Weaknesses**:
- Less polished UX
- Requires more setup
- JetBrains Edit limited to single file

**Relevance to Yume**: Privacy-conscious users are a segment. Their CLI mode and background agents show demand for terminal-based AI coding with async execution. Consider offline/local model support.

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

## Autonomous AI Agents

### Devin (Cognition AI)

**Type**: Autonomous AI software engineer
**Price**: $20/mo minimum (Core), Teams from $500/mo
**Status**: Devin 2.0 released April 2025

**Key Features**:
- Works through Slack like a teammate
- Own sandboxed environment (shell, editor, browser)
- Independently iterates on implementations
- Fixes test failures autonomously
- Can work for 7+ hours on complex tasks
- Multiple parallel Devins with cloud IDEs
- **Now owns Windsurf**: Acquired product, brand, IP, enterprise contracts

**Pricing (Devin 2.0)**:
- Core: $20/mo minimum, $2.25 per ACU (Agent Compute Unit)
- Teams: $500/mo base, 250 ACUs included, $2.00 per ACU
- 1 ACU ≈ 15 minutes active work ($11/hour effective rate)

**Devin 2.0 Improvements**:
- 83% more tasks completed per ACU vs predecessor
- Multiple parallel Devins
- Cloud-based IDE per agent
- Improved efficiency on junior-level tasks

**Strengths**:
- True autonomous coding
- Multi-hour complex task execution
- Team integration via Slack
- Now includes Windsurf IDE + user base

**Weaknesses**:
- Expensive for frequent use ($11/hour)
- Credit-based can be unpredictable
- Still limited to certain task types
- "Junior developer" level tasks

**Relevance to Yume**: Devin represents fully autonomous direction. Different use case (delegate vs collaborate). Pricing shows premium for autonomous work. Windsurf acquisition creates integrated offering.

---

### OpenAI Codex

**Type**: Autonomous AI coding agent
**Price**: Included in ChatGPT Plus, Pro, Business, Enterprise, Edu
**Access**: Cloud web agent, CLI tool, IDE extensions

**Key Features**:
- **GPT-5.2-Codex**: SOTA on SWE-Bench Pro, Terminal-Bench 2.0
- Context compaction for long-horizon work
- Large refactors and migrations
- Improved Windows environment support
- **Skills System**: `$skill-name` invocation or auto-selection
- Multi-agent collaboration with explorer role
- Can work independently for 7+ hours
- Web, CLI, and IDE access

**Recent Updates (Jan 2026)**:
- **GPT-5.2-Codex**: Default model for signed-in users
- Multi-agent collaboration with max-depth guardrails
- Cached web_search as default behavior
- Stronger cybersecurity capabilities
- Better context compaction

**Strengths**:
- Included in ChatGPT subscriptions
- Multi-interface (web, CLI, IDE)
- Long-horizon task execution
- Skills system for customization
- Strong benchmarks

**Weaknesses**:
- OpenAI ecosystem only
- Subscription required
- Less community tooling than Claude

**Relevance to Yume**: Major competition from OpenAI. Skills system similar to yume's. Multi-interface approach validates our desktop + CLI strategy. yume-cli integration important.

---

## Browser-Based Development Platforms

### Replit

**Type**: AI-powered browser development platform
**Price**: Free tier, paid plans for more compute
**Status**: Agent-first platform in 2026

**Key Features**:
- **Agent 3**: 10x more autonomous, 200 minute runtime
- Builds, tests & fixes apps automatically
- Can build other agents and automations
- Integrates with Slack, Notion
- Multi-language support (50+ languages)
- Built-in Auth, Database, Hosting, Monitoring
- Stripe/OpenAI plug-ins without API key management
- **Design Mode**: Visual app building

**Evolution (2025-2026)**:
- Agent v2 (February 2025)
- Agent 3 (September 2025)
- Design Mode (November 2025)
- 2-3x speed improvements throughout year
- Agent now tests itself, builds other agents

**Strengths**:
- Full-stack in browser
- Zero setup
- Instant deployment
- Agent can build agents

**Weaknesses**:
- High/unpredictable pricing
- AI limitations can break other parts
- Browser-only
- Less control than local development

**Relevance to Yume**: Different segment (browser vs desktop). Shows vibe coding trend. Agent building agents is interesting. Validates autonomous execution direction.

---

### Bolt.new (StackBlitz)

**Type**: AI-powered browser full-stack builder
**Price**: Credit-based
**Technology**: WebContainers (Node.js in browser)

**Key Features**:
- Full-stack apps from natural language prompts
- Runs entirely in browser (WebContainers)
- Vite integration with HMR
- **Claude Agent**: Most powerful builder option, uses Claude 4.5
- Secret masking for API keys
- Instant deployment

**2026 Performance**:
- 40% build performance improvement
- Cold start optimization
- Incremental builds with IndexedDB caching
- Edge processing for LLM reasoning

**Security Features (2026)**:
- Browser sandbox = secure by default
- Enhanced secret masking
- No access to local file system

**Strengths**:
- Zero installation
- Instant full-stack apps
- WebContainer isolation
- Claude 4.5 integration

**Weaknesses**:
- Browser-only
- Credit-based pricing
- Limited to web technologies
- Less control than local dev

**Future**: Python and Go support in browser planned

**Relevance to Yume**: Browser vs desktop tradeoff. Shows demand for rapid prototyping. Different user segment but validates AI-powered app building.

---

### Augment Code

**Type**: Enterprise AI coding assistant
**Price**: Enterprise pricing
**Funding**: $252M (backed by Eric Schmidt)

**Key Features**:
- **Context Engine**: 200K token context, processes 400K+ file repos
- Semantic dependencies across entire codebase
- **auggie**: CLI AI agent
- **review-pr**: Automated PR review from Auggie
- Intelligent code refactoring
- SDK upgrades and lifecycle support

**Enterprise Credentials**:
- **ISO/IEC 42001**: First AI coding assistant certified
- SOC 2 Type II compliant
- Customer-managed encryption keys
- Code never trains foundation models

**Strengths**:
- Enterprise-grade security
- Massive context window (200K)
- Cross-service dependency understanding
- Legacy modernization specialist

**Weaknesses**:
- Enterprise pricing
- Less indie/startup friendly
- Focused on large codebases

**Relevance to Yume**: Enterprise compliance benchmark. Their 200K context interesting. ISO 42001 certification shows direction for enterprise AI tools.

---

## Multi-Agent Orchestration Tools

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

## Usage Monitoring Tools

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

## Comparison Matrix (January 2026)

| Tool | Type | Price | Agentic | Tab Complete | Multi-Agent | Native | Status |
|------|------|-------|---------|--------------|-------------|--------|--------|
| **Cursor** | IDE | $20-200/mo | Yes (background) | Yes (250 tok/s) | Yes (8+ parallel) | No (Electron) | $1B+ ARR |
| **Windsurf** | IDE | $15-60/mo | Yes (Cascade) | Yes | Yes (Wave 13) | No (Electron) | Cognition |
| **Zed** | IDE | Free-$20/mo | Yes (ACP) | Yes (Zeta) | Yes (external) | Yes (Rust) | Growing |
| **Claude Code CLI** | CLI | Pro/Max | Yes (subagents) | No | Yes | Terminal | 80.9% SWE |
| **Yume** | Desktop | Free | Yes (4 agents) | No | Yes (background) | Yes (Tauri/Rust) | Indie |
| **Opcode** | Desktop | Free | Yes | No | Yes | Yes (Tauri) | 19K stars |
| **OpenCode** | CLI | Free | Yes | No | No | Terminal | 48K stars |
| **Aider** | CLI | API costs | Partial | No | No | Terminal/Browser | OSS |
| **Cline** | Extension | API costs | Yes | No | No | No (VS Code) | 2.4M installs |
| **Copilot** | Extension | Free-$39/mo | Yes (cloud) | Yes | Yes (custom) | No | Enterprise |
| **Continue** | Extension | Free | Yes | Yes | Yes (background) | No | 26K stars |
| **Gemini CLI** | CLI | Free | Yes | No | No | Terminal | Google |
| **Codex** | Multi | ChatGPT+ | Yes | No | Yes | Multi | OpenAI |
| **Devin** | Autonomous | $20+/mo | Fully | No | Yes (parallel) | Cloud | Cognition |

---

## Feature Gap Summary (Yume vs Leaders)

| Feature | Cursor | Windsurf | Opcode | Zed | Yume | Gap? |
|---------|--------|----------|--------|-----|----------|------|
| Plugin/Skills System | ❌ | ❌ | ❌ | ❌ | ✅ Full | **Unique** |
| Smooth UI | Issues | Good | Good | ✅ Best | ✅ Native | No |
| Tab completion | ✅ 250 tok/s | ✅ | ❌ | ✅ Zeta | ❌ (different product) | N/A |
| Visual diff | ✅ | ✅ | ✅ | ✅ | ✅ | No |
| Cost tracking | ❌ | Partial | ✅ | ❌ | ✅ Full | No |
| **5h/7d limit tracking** | ❌ | ❌ | ❌ | ❌ | ✅ | **Unique** |
| Checkpoints | ❌ | ❌ | ✅ | ❌ | ✅ | No |
| Auto-compact | ❌ | ❌ | ❌ | ❌ | ✅ 70%/75%/80% | **Unique** |
| Analytics | ❌ | ❌ | ✅ Cost | ❌ | ✅ Project+cost | **Advantage** |
| MCP support | ❌ | ✅ | ✅ | ❌ | ✅ Full UI | No |
| Themes | ~5 | ~3 | ❌ | ✅ | ✅ **12 themes** | **Advantage** |
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
| Drag & drop | ✅ | ✅ | ❌ | ✅ | ✅ | No |
| Light mode | ✅ | ✅ | ? | ✅ | ❌ (OLED focus) | Design choice |
| Memories | ✅ | ✅ | ❌ | ❌ | ✅ Memory V2 | No |
| Command palette | ✅ | ✅ | ❌ | ✅ | ✅ Cmd+P | No |
| CLAUDE.md editor | ❌ | ❌ | ✅ | ❌ | ✅ | No |
| Background agents | ✅ | ✅ | ✅ | ✅ (ACP) | ✅ 4 concurrent | No |
| Orchestration flow | ❌ | ❌ | ❌ | ❌ | ✅ Auto-agent | **Unique** |
| ACP support | ❌ | ❌ | ❌ | ✅ | ❌ | Gap |
| Sandbox security | ❌ | ❌ | ✅ | ❌ | ❌ | Gap |
| Session forking | ✅ Cmd+Shift+D | ❌ | ✅ | ❌ | ❌ | - |

---

## Comprehensive Comparison Chart (January 2026)

### Yume vs All Competitors - Feature Matrix

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Price** | Free | Pro/Max sub | $20-200/mo | $15-60/mo | Free | Free-$20/mo | Free+API |
| **Type** | Desktop GUI | CLI | IDE | IDE | Desktop GUI | IDE | CLI |
| **Native Performance** | ✅ Tauri/Rust | ❌ React Ink | ❌ Electron | ❌ Electron | ✅ Tauri | ✅ Rust | ❌ Python |
| **No Flickering** | ✅ | ❌ (700+ upvotes) | ⚠️ Issues | ⚠️ | ✅ | ✅ | N/A |
| **Multi-Tab Sessions** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Crash Recovery** | ✅ 24hr | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Context & Analytics

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **5h/7d Limit Tracking** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Token Counter** | ✅ Visual | Partial | ❌ | ✅ Meter | ✅ | ❌ | ✅ Progress |
| **Cost Tracking** | ✅ Full | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Auto-Compaction** | ✅ 70%/75%/80% | ✅ 95% | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Usage Analytics** | ✅ project+cost | ✅ /stats heatmap | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Streak Tracking** | ❌ gap | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Peak Hour Analysis** | ❌ gap | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Input Features

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **@ Mentions** | ✅ @r/@m/folders | Partial | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ultrathink Support** | ✅ Cmd+K + rainbow | Typing only | ❌ | ❌ | ❌ | ❌ | ✅ --thinking-tokens |
| **Slash Commands** | ✅ 8+ custom | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Bash Mode (!/$)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Drag & Drop** | ✅ Files+tabs | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Image Paste** | ✅ | ✅ | ✅ | ✅ | ❓ | ✅ | ✅ |
| **Voice Input** | ✅ F5 | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ /voice |

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
| **Orchestration Flow** | ✅ Auto-agent | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Architect |
| **Custom Agents** | ✅ | ✅ /agents | ✅ | ✅ | ✅ | ✅ ACP | ❌ |
| **Themes** | ✅ 12 | ❌ terminal | ~5 | ~3 | ❌ | ✅ | ❌ |
| **Font Customization** | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Background Opacity** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Hooks & Security

| Feature | Yume | Claude CLI | Cursor | Windsurf | Opcode | Zed | Aider |
|---------|----------|------------|--------|----------|--------|-----|-------|
| **Hook Events** | ✅ 9 events | Partial | ✅ Security | ❌ | ❌ | ❌ | ❌ |
| **Yume Guard** | ✅ UNIQUE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP Support** | ✅ Visual UI | ✅ JSON | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Sandbox Security** | ❌ | ❌ | ❌ | ❌ | ✅ seccomp/Seatbelt | ❌ | ❌ |

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
| **Freeware** | Free to use, Pro $29 optional for power users |
| **4 Built-in Agents** | architect, explorer, implementer, guardian |
| **Orchestration Flow** | Auto-selects agents based on task complexity |
| **12 Themes** | More than any competitor |
| **9 Hook Events** | Most comprehensive hook system |
| **Yume Guard** | Built-in security blocking dangerous commands |
| **Stream Timers** | Live thinking/bash/compacting duration |
| **@ Mention System** | @ shows recent/modified with autocomplete, folder navigation |
| **Memory V2** | Per-project markdown with TTL and importance levels |
| **Crash Recovery** | Auto-save with 24hr window |
| **History/Rollback** | Visual message history with rollback |
| **Ultrathink** | Cmd+K insert + rainbow highlighting |
| **Multi-Provider** | Claude, Gemini, OpenAI via yume-cli shim |

#### Yume Weaknesses
| Weakness | Competitor Advantage |
|----------|---------------------|
| No light mode | Cursor, Windsurf, Zed have it (design choice - OLED focus) |
| No checkpoint-based forking | Opcode can fork from checkpoints (yume has basic fork via Cmd+Shift+D) |
| No tab completion | IDE feature (different product category) |
| No activity heatmap | CLI has year/week grid |
| No streak tracking | CLI tracks current/longest streaks |
| No peak hour analysis | CLI shows usage patterns by hour |
| No ACP support | Zed's open standard gaining adoption |
| No sandbox security | Opcode has seccomp/Seatbelt |

#### When to Choose Each Tool

| Use Case | Best Choice | Why |
|----------|-------------|-----|
| Claude Code without lag | **Yume** | Native rendering, all CLI features |
| Full IDE replacement | **Cursor** | Most features, large ecosystem |
| Budget-conscious | **Yume** (free) or **Opcode** (free) | Both free vs subscriptions |
| Privacy-focused | **Yume**, **Zed**, or **Continue** | No telemetry, local-first |
| Enterprise/Teams | **Cursor** or **Copilot** | SOC2, SSO, admin controls |
| Multi-model flexibility | **OpenCode** or **Aider** | Provider-agnostic |
| Best AI quality | **Claude Code** tools | 80.9% SWE-bench leads market |
| Autonomous coding | **Devin** or **Codex** | Fully autonomous agents |
| Browser-based | **Replit** or **Bolt.new** | Zero installation |

---

## Key Insights (Updated January 2026)

1. **Native performance validated**: Cursor's memory/performance issues prove Electron struggles at scale. Zed and yume's Rust approach is correct.

2. **Tab completion is an IDE feature**: Cursor/Windsurf are code editors with inline completion. Yume is a chat interface - different product category. Not a real gap.

3. **Subscriptions cause friction**: Cursor's June pricing changes caused backlash. Yume's freeware model is a major differentiator vs Cursor/Windsurf subscriptions. Both Yume and Opcode are free.

4. **Context memory matters**: Both Cursor and Windsurf added "Memories". Yume has Memory V2 system with per-project markdown, TTL, and importance levels - more sophisticated than competitor approaches.

5. **Checkpoint/timeline**: ✅ Both yume and Opcode have this. No longer unique, but still differentiator vs IDEs.

6. **Auto-compaction is unique**: No competitor (including Opcode) has dynamic auto-compaction thresholds (default: 70% warn, 75% auto, 80% force). Genuine yume innovation.

7. **12 themes vs ~5**: Yume has massively more theming options than any competitor. Opcode has none.

8. **4 built-in agents**: Yume agents (architect, explorer, implementer, guardian) are unique - no competitor has pre-configured specialized agents.

9. **Orchestration flow**: Auto-selects agents based on task complexity - unique to yume.

10. **Custom commands system**: 5 defaults (/compact, /init, /commit, /review, /iterate) + user-defined commands with templates - unique feature.

11. **Hooks system (9 events)**: More comprehensive than any competitor's. Cursor now has security hooks via partnerships.

12. **5h + 7-day limit tracking**: **UNIQUE** - Only yume tracks actual Anthropic subscription limits. Opcode only does cost tracking.

13. **Keyboard-first design**: 32+ shortcuts, bash mode (!/$). Opcode lacks keyboard focus.

14. **@ mention system**: @r (recent files), @m (modified files), folder navigation. No competitor has this.

15. **Stream timers**: Live thinking/bash/compacting duration timers. No competitor shows this.

16. **Ultrathink support**: Cmd+K inserts ultrathink prefix + rainbow gradient highlighting. Unique to yume.

17. **History/rollback panel**: Visual message history with rollback capability. Unique.

18. **Crash recovery**: Auto-save every 5 min. Opcode doesn't have this.

19. **Windsurf split acquisition**: OpenAI deal failed (Microsoft IP rights), Google DeepMind got CEO + engineers ($2.4B), Cognition got product/brand/IP. Market volatility.

20. **ACP protocol emerging**: Zed's Agent Client Protocol gaining adoption (JetBrains, Neovim, Emacs). Consider implementing.

21. **Autonomous agents rising**: Devin 2.0 price drop ($500 → $20), Codex 7-hour sessions, Replit Agent 3. Different use case from yume.

22. **Claude Code leads benchmarks**: 80.9% SWE-bench. Being Claude-native is an advantage, not a limitation.

23. **Opcode has 19K+ stars but lacks key features**: They have community momentum but yume is technically superior in 12+ categories. Opcode's advantages: session forking, sandbox security, free.

24. **Multi-model is strategic**: OpenCode (48K stars), Aider, Gemini CLI all offer model flexibility. yume-cli already supports this but feature-flagged.
