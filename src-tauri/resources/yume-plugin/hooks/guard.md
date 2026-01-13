---
name: yume guard
event: PreToolUse
description: blocks dangerous commands, privilege escalation, and protected paths
---

```python
#!/usr/bin/env python3
import json, sys, re

DANGEROUS_PATTERNS = [
    # destructive
    r'\brm\s+(-[^\s]*r|--recursive)', r'\brm\s+-rf', r'\bsudo\s+rm\b',
    r'\bshred\b', r'\bfind\s+.*-delete', r'\bxargs\s+rm',
    r'\bdd\s+', r'\bmkfs\.', r'\bfdisk\b', r'>/dev/sd',
    r':\(\)\s*\{',  # fork bomb
    # privilege
    r'\bsudo\s+', r'\bsu\s+-', r'\bdoas\s+', r'\bpkexec\b',
    r'\bchmod\s+[ugo]?\+s', r'\bchown\s+root', r'/etc/sudoers',
    # system
    r'\bshutdown\b', r'\breboot\b', r'\bhalt\b', r'\bpoweroff\b',
    r'\bsystemctl\s+(disable|mask|stop)', r'\blaunchctl\s+(unload|remove)',
    r'\biptables\b', r'\bufw\b', r'\bkillall\b', r'\bpkill\s+-9',
    r'\bcrontab\s+-[re]',
    # remote exec
    r'curl.*\|.*sh', r'wget.*\|.*sh', r'\beval\s+.*\$',
    r'\bnc\s+.*-e', r'\bbash\s+-i.*>/dev/tcp',
    # git
    r'git\s+push\s+.*(-f|--force)', r'git\s+reset\s+--hard',
    r'git\s+clean\s+-[dfx]', r'git\s+branch\s+-D\s+(main|master)',
    # windows
    r'\bformat\s+[a-z]:', r'\bdel\s+/[sfq]', r'\brd\s+/s',
    r'\breg\s+(delete|add)', r'\bdiskpart\b', r'\bbcdedit\b',
    r'powershell.*-enc', r'powershell.*bypass',
]

PROTECTED_PATHS = [
    '/usr/', '/etc/', '/bin/', '/sbin/', '/var/', '/boot/', '/root/',
    '/sys/', '/proc/', '/dev/', '/system/', '/library/',
    '.ssh/', '.gnupg/', '.aws/', '.kube/', '.docker/',
    '.bashrc', '.zshrc', '.profile', '.gitconfig', '.git-credentials',
    'id_rsa', 'id_ed25519', '.netrc', '.npmrc',
    'c:/windows', 'c:/program files', 'system32',
]

def check_path(path):
    if not path: return False
    p = path.lower().replace('\\', '/')
    if '..' in p: return True
    return any(x in p for x in PROTECTED_PATHS)

try:
    data = json.load(sys.stdin).get('data', {})
    tool, inp = data.get('tool', ''), data.get('input', {})

    if tool == 'Bash':
        cmd = inp.get('command', '')
        if any(re.search(p, cmd, re.I) for p in DANGEROUS_PATTERNS):
            print('{"action":"block","message":"blocked by yume guard"}')
            sys.exit(2)

    if tool in ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']:
        path = inp.get('file_path', '') or inp.get('notebook_path', '')
        if check_path(path):
            print('{"action":"block","message":"blocked - protected path"}')
            sys.exit(2)

    print('{"action":"continue"}')
except:
    print('{"action":"block","message":"guard error - blocked"}')
    sys.exit(2)
```
