import { IconShield, IconGitBranch, IconFolderOff, IconPlayerPause } from '@tabler/icons-react';

export const YURUCODE_HOOKS = [
  {
    id: 'tool_shield',
    name: 'Tool Shield',
    icon: IconShield,
    description: 'block dangerous bash commands (rm -rf, dd, mkfs, etc)',
    script: `#!/usr/bin/env python3
import json
import sys
import re

# Tool Shield - Block dangerous bash commands
# Catches: rm -rf, rm -r -f, sudo rm, dd if=, mkfs, chmod 777, etc.

DANGEROUS_PATTERNS = [
    r'\\brm\\s+(-[^\\s]*r[^\\s]*\\s+-[^\\s]*f|−[^\\s]*f[^\\s]*\\s+-[^\\s]*r|--recursive.*--force|--force.*--recursive)',
    r'\\brm\\s+-rf\\b',
    r'\\brm\\s+-fr\\b',
    r'\\bsudo\\s+rm\\b',
    r'\\bdd\\s+if=',
    r'\\bmkfs\\.',
    r'\\b:(){ :|:& };:',  # fork bomb
    r'\\bchmod\\s+(-[^\\s]*\\s+)?777\\b',
    r'\\bchown\\s+(-[^\\s]*\\s+)?root:',
    r'>/dev/sd[a-z]',
    r'\\bformat\\s+[a-z]:',  # windows format
    r'\\bdel\\s+/[sfq]',  # windows del with dangerous flags
]

try:
    input_data = json.load(sys.stdin)
    tool = input_data.get('data', {}).get('tool', '')

    if tool == 'Bash':
        command = input_data.get('data', {}).get('input', {}).get('command', '')
        command_lower = command.lower()

        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, command_lower, re.IGNORECASE):
                response = {
                    "action": "block",
                    "message": f"⚠️ Dangerous command blocked: pattern matched. Review and run manually if needed."
                }
                print(json.dumps(response))
                sys.exit(2)

    print('{"action":"continue"}')
    sys.exit(0)
except Exception as e:
    print('{"action":"continue"}')
    sys.exit(0)`
  },
  {
    id: 'git_guard',
    name: 'Git Guard',
    icon: IconGitBranch,
    description: 'block dangerous git operations (force push, hard reset)',
    script: `#!/usr/bin/env python3
import json
import sys
import re

# Git Guard - Block dangerous git operations
# Catches: push --force, reset --hard, clean -fd, etc.

DANGEROUS_GIT_PATTERNS = [
    r'git\\s+push\\s+.*--force',
    r'git\\s+push\\s+-f\\b',
    r'git\\s+reset\\s+--hard',
    r'git\\s+clean\\s+.*-f.*-d',
    r'git\\s+clean\\s+-fd',
    r'git\\s+checkout\\s+--\\s+\\.',  # discard all changes
    r'git\\s+branch\\s+-D\\s+main',
    r'git\\s+branch\\s+-D\\s+master',
]

try:
    input_data = json.load(sys.stdin)
    tool = input_data.get('data', {}).get('tool', '')

    if tool == 'Bash':
        command = input_data.get('data', {}).get('input', {}).get('command', '')

        for pattern in DANGEROUS_GIT_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                response = {
                    "action": "block",
                    "message": f"⚠️ Dangerous git operation blocked. Run manually if you're sure."
                }
                print(json.dumps(response))
                sys.exit(2)

    print('{"action":"continue"}')
    sys.exit(0)
except Exception as e:
    print('{"action":"continue"}')
    sys.exit(0)`
  },
  {
    id: 'system_path_guard',
    name: 'System Path Guard',
    icon: IconFolderOff,
    description: 'block writes to system directories (/usr, /etc, /bin)',
    script: `#!/usr/bin/env python3
import json
import sys
import os

# System Path Guard - Block writes to system directories
# Protects: /usr, /etc, /bin, /sbin, /var, /boot, /lib, /opt, C:\\Windows, etc.

PROTECTED_PATHS = [
    '/usr/', '/etc/', '/bin/', '/sbin/', '/var/', '/boot/',
    '/lib/', '/lib64/', '/opt/', '/root/', '/sys/', '/proc/',
    'C:\\\\Windows', 'C:\\\\Program Files', 'C:\\\\System32',
]

def is_protected_path(file_path):
    if not file_path:
        return False
    normalized = file_path.replace('\\\\', '/')
    for protected in PROTECTED_PATHS:
        protected_norm = protected.replace('\\\\', '/')
        if normalized.startswith(protected_norm) or normalized.lower().startswith(protected_norm.lower()):
            return True
    return False

try:
    input_data = json.load(sys.stdin)
    tool = input_data.get('data', {}).get('tool', '')
    tool_input = input_data.get('data', {}).get('input', {})

    if tool in ['Write', 'Edit', 'MultiEdit']:
        file_path = tool_input.get('file_path', '')
        if is_protected_path(file_path):
            response = {
                "action": "block",
                "message": f"⚠️ Cannot write to system directory: {file_path}"
            }
            print(json.dumps(response))
            sys.exit(2)

    print('{"action":"continue"}')
    sys.exit(0)
except Exception as e:
    print('{"action":"continue"}')
    sys.exit(0)`
  },
  {
    id: 'pause_mode',
    name: 'Pause Mode',
    icon: IconPlayerPause,
    description: 'block all file changes (discussion only)',
    script: `#!/usr/bin/env python3
import json
import sys

# Pause Mode - Block all file modifications
# Use when you want Claude to discuss/plan without making changes

BLOCKED_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']

try:
    input_data = json.load(sys.stdin)
    tool = input_data.get('data', {}).get('tool', '')

    if tool in BLOCKED_TOOLS:
        response = {
            "action": "block",
            "message": "⏸️ Pause mode active - file changes blocked. Disable this hook to allow edits."
        }
        print(json.dumps(response))
        sys.exit(2)

    print('{"action":"continue"}')
    sys.exit(0)
except Exception as e:
    print('{"action":"continue"}')
    sys.exit(0)`
  }
];
