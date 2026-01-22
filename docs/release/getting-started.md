# getting started

## 1. install claude cli

```bash
npm install -g @anthropic-ai/claude-code
claude  # login
```

## 2. download yume

| platform | file |
|----------|------|
| mac m1/m2/m3/m4 | `yume-x.x.x-arm64.dmg` |
| mac intel | `yume-x.x.x-x64.dmg` |
| windows | `yume-x.x.x-x64-setup.exe` |
| linux | `yume-x.x.x-x64.AppImage` |

## 3. install

**mac**: open dmg, drag to applications. first launch: right-click → open.

**windows**: run installer.

**linux**: `chmod +x yume-*.AppImage && ./yume-*.AppImage`

## 4. run

pick a working directory when prompted. that's where claude will look for code.

---

## optional: other providers

```bash
# gemini
npm install -g @google/gemini-cli
gemini auth login

# openai
npm install -g @openai/codex
codex login
```

switch providers in the model picker. switching forks the session.

---

## troubleshooting

**"app is damaged" on mac**: `xattr -cr /Applications/Yume.app`

**can't find claude**: make sure `claude --version` works in terminal

**only 2 tabs**: trial mode. $21 for pro (99 tabs)

[more in faq →](faq.md)
