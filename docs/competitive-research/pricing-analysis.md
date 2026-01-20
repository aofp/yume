# Pricing Analysis

*Last Updated: January 14, 2026*

*Detailed breakdown of AI coding tool pricing models*

## Pricing Model Types

### 1. Token-Based (Pay-as-you-go)
**Examples**: Claude API, OpenAI API

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude Opus 4.1/4 | $15 | $75 |
| Claude Sonnet 4 | $3 | $15 |
| Claude Haiku 3.5 | $0.80 | $4 |
| GPT-4o | $2.50 | $10 |
| DeepSeek R1 | $0.55 | $2.19 |

**Pros**: Pay exactly for usage, no waste
**Cons**: Unpredictable costs, can spike

**Real-world costs**:
- Light users: $5-20/month
- Heavy users: $100-300/month
- One Augment user cost them $15,000/month to serve

### 2. Credit-Based
**Examples**: Cursor, Windsurf, Augment

**Cursor**:
- Free: Limited credits
- Pro ($20/mo): Standard credits + pay-as-you-go overflow
- Enterprise: Custom

**Windsurf** (April 2025 update):
- Simplified to single-credit system
- $15/mo for standard plan

**Augment** (October 2025):
- Trial: 30,000 credits
- $20/mo (Indie): 125 messages
- $50/mo (Developer): 600 messages
- $100/mo (Professional): 1,500 messages
- $250/mo (Max): 4,500 messages
- Power users: $200+/month

### 3. Subscription-Based (Flat Rate)
**Examples**: GitHub Copilot, Tabnine

**GitHub Copilot**:
| Tier | Price | Features |
|------|-------|----------|
| Individual | $10/mo | Basic completion |
| Pro | $19/mo | Advanced features |
| Pro+ | $39/mo | 1,500 premium requests |
| Business | $19/user/mo | Team features |
| Enterprise | $39/user/mo | SSO, audit, compliance |

**Tabnine**:
- Starter: Free
- Dev: $12/mo
- Enterprise: $39/user/mo

### 4. Hybrid Models
**Examples**: Devin

**Devin**:
- Was $500/month initially
- Dropped to $20/month with v2.0
- Uses "Agent Compute Units" (ACUs)
- 1 ACU ≈ 15 minutes of AI work

---

## Cost Comparison: 500-Developer Team

| Tool | Annual Cost | Per-Developer |
|------|-------------|---------------|
| GitHub Copilot Business | $114,000 | $19/mo |
| Cursor Business | $192,000 | $32/mo |
| Tabnine Enterprise | $234,000 | $39/mo |
| Windsurf Team | $210,000 | $15/mo |

---

## Market Trends (Q3-Q4 2025)

### Price Pressure
- Chinese models closed performance gap
- Undercut US providers by 70-95%
- Free tiers expanded significantly

### Notable Changes
- Gemini: 6K daily free requests (unprecedented) - **Yume integration in progress**
- Poe: $5/mo entry tier
- Copilot: $10/mo individual
- Devin: $500 → $20/mo drop

### The "Unlimited" Problem
> "One $250/month user was costing Augment $15,000/month to serve"

"Unlimited AI coding is unsustainable" - industry consensus

---

## Pricing Strategy Insights

### What Works
1. **Transparent pricing** - Cline shows per-request costs
2. **Predictable caps** - Users hate surprise bills
3. **Free tier** - Essential for adoption
4. **BYOK option** - "Bring Your Own Key" for cost control

### What Fails
1. **Complex credit systems** - Confuses users
2. **Hidden overages** - Cursor's $71/day incident
3. **Fast/slow tiers** - Perceived as unfair
4. **Dynamic throttling** - Feels like bait-and-switch

### User Complaints
- "Now costs more than Cursor and Windsurf combined" (Augment)
- "Surprise bills" (Cursor)
- "Rate limits make it unusable" (Various)

---

## Yume Pricing Model

### Chosen Model: $21 One-Time Purchase

Yume uses a fundamentally different approach:

```
User pays: $21 one-time + existing Claude subscription
          ↓
Uses: Claude Code CLI under the hood
          ↓
Result: No API costs, no recurring fees, uses subscription limits
```

### How It Works

| Component | Who Pays | How Much |
|-----------|----------|----------|
| Yume app | User → Yume | $21 once |
| Claude usage | User → Anthropic | Pro $20/mo, Max $100-200/mo |
| API calls | N/A | Uses subscription, not API |

### Why This Works

1. **No surprise bills** - Users already budgeted for Claude subscription
2. **Simple** - Pay once, use forever
3. **Developer-friendly** - One-time purchase appeals to devs
4. **Low barrier** - $21 is impulse-buy territory
5. **Aligns incentives** - We improve product, not extract recurring revenue

### Competitive Comparison

| Tool | Model | Monthly Cost |
|------|-------|--------------|
| Cursor Pro | Subscription | $20/mo ($240/yr) |
| Windsurf | Subscription | $15/mo ($180/yr) |
| Copilot Pro | Subscription | $19/mo ($228/yr) |
| Cline | BYOK | Free + API costs |
| **Yume** | **One-time** | **$21 once** |

### Value Proposition

> "Pay $21 once. Use your Claude subscription without the lag."

For a Claude Pro user at $20/mo:
- Year 1: $21 (yume) + $240 (Claude) = $261
- Year 2+: $0 (yume) + $240 (Claude) = $240

vs Cursor:
- Year 1: $240
- Year 2+: $240

**Yume + Claude = same yearly cost as Cursor, but you get Claude's power.**

### Pricing Psychology

- $21 is impulse-buy territory (one nice lunch)
- No subscription fatigue
- One decision, not monthly justification
- Ownership feeling vs. renting

---

## Usage Transparency (Still Valuable)

Even with subscription model, transparency helps users:

### What We Can Show
- Session token usage
- Subscription limit status
- Usage patterns over time
- When approaching limits

### Why This Matters
- Claude Pro/Max have weekly limits
- Users want to know remaining capacity
- Helps pace usage across the week

This is still a **differentiator** vs Claude Code CLI (which has minimal usage visibility).

---

## Sources

- [AI Coding Tools Pricing Battle](https://medium.com/@d.jeziorski/the-ai-coding-tools-pricing-battle-who-offers-the-most-in-the-pro-plan-f8a3a6f63182)
- [AI Development Tools Pricing Analysis](https://vladimirsiedykh.com/blog/ai-development-tools-pricing-analysis-claude-copilot-cursor-comparison-2025)
- [GetDX AI Coding Assistant Pricing](https://getdx.com/blog/ai-coding-assistant-pricing/)
- [Augment Pricing Changes](https://www.augmentcode.com/blog/augment-codes-pricing-is-changing)
