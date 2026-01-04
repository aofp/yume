# competitor research

comprehensive competitive landscape analysis for yurucode

**mission**: make yurucode so good that anthropic wants to buy it

---

## quick links

### strategy documents
- [**ACQUISITION-ROADMAP.md**](./ACQUISITION-ROADMAP.md) - path to anthropic acquisition ⭐
- [**MINIMALISM-SPEED-UX.md**](./MINIMALISM-SPEED-UX.md) - ux/design analysis ⭐
- [**FEATURE-ROADMAP.md**](./FEATURE-ROADMAP.md) - implementation plan
- [**SPEED-GAPS.md**](./SPEED-GAPS.md) - what to fix for speed dominance
- [**COMPARISON-MATRIX.md**](./COMPARISON-MATRIX.md) - feature tables

### competitor analyses
- [sculptor](./sculptor/) | [opcode](./opcode/) | [claudia](./claudia/)
- [cursor](./cursor/) | [windsurf](./windsurf/)
- [opencode](./opencode/) | [aider](./aider/)

---

## the thesis

### anthropic acquired bun (dec 2025)

> "Anthropic acquired Bun to boost speed and stability of Claude Code"
> — Claude Code reached $1B revenue milestone

**yurucode opportunity**: be the "bun of claude code ui"

| bun | yurucode |
|-----|----------|
| fastest js runtime | fastest claude gui |
| powers backend | powers frontend |
| technical excellence | technical excellence |

---

## yurucode strengths

### already best-in-class ⚡

| strength | evidence |
|----------|----------|
| **30+ shortcuts** | most of any gui wrapper |
| **tauri 2 native** | 25x smaller than electron |
| **<2s startup** | vs 1min (sculptor), 5s (cursor) |
| **performance presets** | auto-detects device |
| **virtualized lists** | handles 1000+ messages |
| **unique features** | ultrathink, bash mode, tab duplicate |

### needs to match competitors

| feature | competitor with it |
|---------|-------------------|
| parallel agents | sculptor, cursor (8) |
| context meter | windsurf |
| turbo mode | windsurf |
| live preview | windsurf |
| custom agents | opcode |

---

## speed metrics

### tauri vs electron (2025 benchmarks)

| metric | tauri (yurucode) | electron (cursor/windsurf) |
|--------|------------------|---------------------------|
| bundle | **3-10 MB** | 100-400 MB |
| memory | **30-40 MB** | 200-300 MB |
| startup | **<500ms** | 1-5 seconds |
| file ops | **40-60% faster** | baseline |

> "Switching to Tauri cut cold-start by 70%, installer from 120MB to 8MB"

---

## ux principles (2025)

### minimalism standards

> "Users compare apps to Figma, Notion. Minimalism isn't nice-to-have—it's baseline."

**linear's example**: keyboard-first, white space, no clutter, speed as brand

### yurucode ux scores

| aspect | score | notes |
|--------|-------|-------|
| minimalism | 8/10 | clean dark theme |
| speed | 9/10 | tauri advantage |
| intuitiveness | 6/10 | needs onboarding |
| polish | 6/10 | needs micro-interactions |

---

## acquisition checklist

### technical
- [ ] <500ms cold startup
- [ ] <10MB bundle
- [ ] all competitor features matched
- [ ] zero reported crashes

### user
- [ ] 10,000+ DAU
- [ ] >50% "very disappointed" test
- [ ] >50 NPS score
- [ ] active community

### strategic
- [ ] known to anthropic team
- [ ] proven claude code integration
- [ ] enterprise ready
- [ ] clear value proposition

---

## competitive positioning

```
yurucode = FASTEST claude code gui

vs sculptor: speed without docker overhead
vs opcode: more shortcuts + parallel tabs
vs cursor: 25x smaller + no extra subscription
vs windsurf: native speed + keyboard focus
```

---

## implementation priority

### phase 1: speed foundation
1. context window meter
2. turbo mode
3. parallel tabs
4. ambient input

### phase 2: ux polish
5. onboarding flow
6. empty states
7. micro-interactions
8. live preview

### phase 3: differentiation
9. agent library
10. predictive commands
11. session templates
12. command chaining

---

## the pitch

### one-liner
"yurucode is the bun of claude code ui - fastest, most native experience for developers"

### value to anthropic
1. **speed**: 25x smaller than electron
2. **native**: true cross-platform via tauri
3. **focused**: claude code only
4. **ready**: production-quality

---

## battle cry

**build for users. acquisition follows.**

- sub-second everything
- keyboard-first always
- parallel by default
- zero friction workflow
- native, not electron
- focused, not bloated
