# getting started

## 1. install claude cli

```bash
npm install -g @anthropic-ai/claude-code
claude  # login
```

## 2. download yume

| platform | file |
|----------|------|
| mac m1/m2/m3/m4 | `yume_x.x.x_arm64.pkg` |
| mac intel | `yume_x.x.x_x64.pkg` |
| windows | `yume_x.x.x_x64-setup.exe` |
| linux deb | `yume_x.x.x_amd64.deb` |
| linux rpm | `yume-x.x.x-1.x86_64.rpm` |

## 3. install

**mac**: run the .pkg installer. first launch: right-click → open (or `xattr -cr /Applications/Yume.app`).

**windows**: run installer.

**linux**: install via `sudo dpkg -i yume_*.deb` or `sudo rpm -i yume-*.rpm`

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

**only 3 tabs**: trial mode (3 tabs, 1 window). $29 for pro (99 tabs, 99 windows)

[more in faq →](faq.md)
