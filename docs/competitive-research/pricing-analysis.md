# Pricing Analysis

*Last Updated: January 2026*

## Pricing Model Types

### 1. Token-Based (Pay-as-you-go)

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Claude Opus 4.5 | $15 | $75 |
| Claude Sonnet 4.5 | $3 | $15 |
| Claude Haiku 3.5 | $0.80 | $4 |
| GPT-4o | $2.50 | $10 |
| DeepSeek R1 | $0.55 | $2.19 |

**Pros:** Pay exactly for usage. **Cons:** Unpredictable costs.

Real-world: Light users $5-20/mo, Heavy users $100-300/mo.

### 2. Credit-Based

| Tool | Pricing |
|------|---------|
| Cursor | Free (limited) / Pro $20/mo / Enterprise custom |
| Windsurf | $15/mo single-credit system |
| Augment | $20-250/mo tiered (125-4,500 messages) |

### 3. Subscription-Based (Flat Rate)

| Tool | Tiers |
|------|-------|
| GitHub Copilot | Individual $10/mo, Pro $19/mo, Pro+ $39/mo, Business $19/user, Enterprise $39/user |
| Tabnine | Free, Dev $12/mo, Enterprise $39/user |

### 4. Hybrid (Devin)

$500/mo dropped to $20/mo with v2.0. Uses "Agent Compute Units" (1 ACU = 15 min AI work).

---

## Enterprise Cost Comparison (500 Developers)

| Tool | Annual Cost |
|------|-------------|
| GitHub Copilot Business | $114,000 |
| Cursor Business | $192,000 |
| Windsurf Team | $210,000 |
| Tabnine Enterprise | $234,000 |

---

## Market Trends (2025)

**Price Pressure:** Chinese models undercut US providers by 70-95%. Free tiers expanding.

**Notable Changes:**
- Gemini: 6K daily free requests
- Devin: $500 → $20/mo
- Copilot: $10/mo individual

**The "Unlimited" Problem:** One Augment user cost them $15,000/mo to serve. Industry consensus: unlimited AI coding is unsustainable.

---

## Pricing Strategy Insights

| What Works | What Fails |
|------------|------------|
| Transparent pricing (Cline shows per-request costs) | Complex credit systems |
| Predictable caps | Hidden overages (Cursor $71/day incident) |
| Free tier | Fast/slow tiers (perceived unfair) |
| BYOK option | Dynamic throttling (bait-and-switch) |

**Common complaints:** Surprise bills, rate limits making tools unusable.

---

## Yume Pricing Model

### $21 One-Time Purchase

**Flow:** $21 one-time → Uses Claude Code CLI → No API costs, uses existing subscription

| Component | Cost |
|-----------|------|
| Yume app | $21 once |
| Claude usage | Pro $20/mo or Max $100-200/mo (to Anthropic) |

**Why it works:** No surprise bills, simple ownership, impulse-buy territory, aligns incentives.

### Competitive Comparison

| Tool | Model | Annual Cost |
|------|-------|-------------|
| Cursor Pro | Subscription | $240 |
| Copilot Pro | Subscription | $228 |
| Windsurf | Subscription | $180 |
| Cline | BYOK | Free + API |
| **Yume** | One-time | **$21** |

### Value Proposition

> "Pay $21 once. Use your Claude subscription without the lag."

For Claude Pro users:
- Year 1: $21 + $240 = $261
- Year 2+: $0 + $240 = $240 (same as Cursor, but with Claude's power)

---

## Usage Transparency

Even with subscription model, transparency helps users pace usage across weekly limits.

**Yume shows:** Session tokens, 5h/7-day limit status, usage patterns, approaching-limit warnings.

**Differentiator:** Claude Code CLI has minimal usage visibility.

---

## Sources

- [AI Coding Tools Pricing Battle](https://medium.com/@d.jeziorski/the-ai-coding-tools-pricing-battle-who-offers-the-most-in-the-pro-plan-f8a3a6f63182)
- [AI Development Tools Pricing Analysis](https://vladimirsiedykh.com/blog/ai-development-tools-pricing-analysis-claude-copilot-cursor-comparison-2025)
- [GetDX AI Coding Assistant Pricing](https://getdx.com/blog/ai-coding-assistant-pricing/)
- [Augment Pricing Changes](https://www.augmentcode.com/blog/augment-codes-pricing-is-changing)
