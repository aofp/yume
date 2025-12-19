import { IconShield } from '@tabler/icons-react';

export const YURUCODE_HOOKS = [
  {
    id: 'yurucode_guard',
    name: 'Yurucode Guard',
    icon: IconShield,
    description: 'comprehensive protection for full-permission agent',
    script: `#!/usr/bin/env python3
import json
import sys
import re
import os

# Yurucode Guard - Maximum protection for full-permission agent
# Blocks: destructive commands, privilege escalation, system modifications
# SECURITY: Fails closed - any error blocks the operation

DESTRUCTIVE_COMMANDS = [
    # file destruction
    r'\\brm\\s+(-[^\\s]*r|--recursive)', r'\\brm\\s+-rf', r'\\brm\\s+-fr',
    r'\\bsudo\\s+rm\\b', r'\\brmdir\\s+--ignore-fail',
    r'\\bshred\\b', r'\\btruncate\\b',
    r'\\bfind\\s+.*-delete', r'\\bfind\\s+.*-exec\\s+rm',
    r'\\bxargs\\s+rm', r'\\bxargs\\s+.*\\brm\\b',
    # disk operations
    r'\\bdd\\s+', r'\\bmkfs\\.', r'\\bfdisk\\b', r'\\bparted\\b',
    r'>/dev/sd', r'>/dev/nvme', r'>/dev/hd',
    # fork bomb patterns
    r':\\(\\)\\s*\\{', r':\\s*\\|\\s*:',
]

PRIVILEGE_ESCALATION = [
    r'\\bsudo\\s+', r'\\bsu\\s+-', r'\\bdoas\\s+', r'\\bpkexec\\b',
    r'\\bchmod\\s+[0-7]*7[0-7]*', r'\\bchmod\\s+[ugo]?\\+s',
    r'\\bchown\\s+root', r'\\bchgrp\\s+(root|wheel)',
    r'\\bsetuid\\b', r'\\bsetgid\\b',
    r'\\bvisudo\\b', r'/etc/sudoers',
]

SYSTEM_MODIFICATION = [
    # system control
    r'\\bshutdown\\b', r'\\breboot\\b', r'\\bhalt\\b', r'\\bpoweroff\\b',
    r'\\binit\\s+[0-6]', r'\\bsystemctl\\s+(disable|mask|stop|enable)\\s+',
    r'\\blaunchctl\\s+(unload|remove|disable)', r'\\blaunchctl\\s+load.*-F',
    r'\\bdefaults\\s+write', r'\\bdefaults\\s+delete',
    # network/firewall
    r'\\biptables\\b', r'\\bufw\\b', r'\\bfirewall-cmd\\b', r'\\bpfctl\\b',
    r'\\bnc\\s+-l', r'\\bnetcat\\s+-l',
    # process killing
    r'\\bkillall\\b', r'\\bpkill\\s+-9', r'\\bkill\\s+-9\\s+-1',
    # cron/scheduled tasks
    r'\\bcrontab\\s+-[re]', r'crontab.*\\|',
    r'\\bat\\b.*<<', r'\\bbatch\\b',
]

REMOTE_CODE_EXEC = [
    r'curl.*\\|.*sh', r'wget.*\\|.*sh', r'curl.*\\|.*bash', r'wget.*\\|.*bash',
    r'\\beval\\s+.*\\$', r'\\bexec\\s+.*\\$',
    r'python.*-c.*exec', r'python.*-c.*eval', r'perl\\s+-e',
    r'\\bnc\\s+.*-e', r'\\bbash\\s+-i.*>/dev/tcp',
    # command substitution with dangerous commands
    r'\\$\\(.*\\brm\\b', r'\\$\\(.*\\bdd\\b', r'\\$\\(.*\\bsudo\\b',
    r'\`.*\\brm\\b.*\`', r'\`.*\\bdd\\b.*\`', r'\`.*\\bsudo\\b.*\`',
]

DANGEROUS_GIT = [
    r'git\\s+push\\s+.*(-f|--force)', r'git\\s+push\\s+-f',
    r'git\\s+reset\\s+--hard', r'git\\s+clean\\s+-[dfx]',
    r'git\\s+checkout\\s+--\\s+\\.', r'git\\s+stash\\s+drop',
    r'git\\s+branch\\s+-D\\s+(main|master|develop|production)',
    r'git\\s+push\\s+.*:(main|master|develop|production)',
]

WINDOWS_DANGEROUS = [
    r'\\bformat\\s+[a-z]:', r'\\bdel\\s+/[sfq]', r'\\brd\\s+/s',
    r'\\breg\\s+(delete|add)', r'\\bnet\\s+user.*/(delete|add)',
    r'\\bdiskpart\\b', r'\\bbcdedit\\b',
    r'powershell.*-e(nc|ncodedcommand)', r'powershell.*bypass',
    r'\\bwmic\\b', r'\\bschtasks\\s+/(create|delete)',
    r'\\bsc\\s+(delete|create|config)',
]

PROTECTED_SYSTEM_PATHS = [
    '/usr/', '/etc/', '/bin/', '/sbin/', '/var/', '/boot/',
    '/lib/', '/lib64/', '/opt/', '/root/', '/sys/', '/proc/',
    '/dev/', '/run/', '/snap/', '/home/',
    '/applications/', '/library/', '/system/',  # macOS
]

PROTECTED_USER_PATHS = [
    '.ssh/', '.gnupg/', '.aws/', '.kube/', '.docker/',
    '.bashrc', '.zshrc', '.profile', '.bash_profile', '.zprofile',
    '.netrc', '.npmrc', '.pypirc', '.gem/credentials',
    '.gitconfig', '.git-credentials',
    '.config/gcloud', '.config/gh/',
    '.local/share/keyrings',
    'id_rsa', 'id_ed25519', 'id_ecdsa',  # SSH keys
]

PROTECTED_WINDOWS_PATHS = [
    'c:/windows', 'c:/program files', 'c:/programdata',
    'c:/users/*/appdata/roaming/microsoft',
    'c:/users/*/ntuser.dat',
    'system32', 'syswow64',
]

def normalize_path(path):
    """Normalize path to catch traversal attempts"""
    if not path: return ''
    # normalize separators
    p = path.lower().replace('\\\\', '/')
    # resolve .. and . components
    parts = []
    for part in p.split('/'):
        if part == '..':
            if parts and parts[-1] != '':
                parts.pop()
        elif part and part != '.':
            parts.append(part)
    return '/' + '/'.join(parts) if p.startswith('/') else '/'.join(parts)

def is_protected_path(path):
    if not path: return False
    p = normalize_path(path)

    # check for path traversal attempts
    if '..' in path:
        return True  # block any traversal attempts

    # system paths (unix/mac)
    for sp in PROTECTED_SYSTEM_PATHS:
        if p.startswith(sp) or p.startswith(sp.lstrip('/')): return True

    # user sensitive paths (substring match)
    for up in PROTECTED_USER_PATHS:
        if up.lower() in p: return True

    # windows paths
    for wp in PROTECTED_WINDOWS_PATHS:
        wp_clean = wp.replace('*', '')
        if wp_clean in p: return True

    return False

def check_command(cmd):
    all_patterns = (DESTRUCTIVE_COMMANDS + PRIVILEGE_ESCALATION +
                   SYSTEM_MODIFICATION + REMOTE_CODE_EXEC +
                   DANGEROUS_GIT + WINDOWS_DANGEROUS)
    for pattern in all_patterns:
        if re.search(pattern, cmd, re.IGNORECASE):
            return True
    return False

try:
    data = json.load(sys.stdin).get('data', {})
    tool = data.get('tool', '')
    inp = data.get('input', {})

    if tool == 'Bash':
        cmd = inp.get('command', '')
        if check_command(cmd):
            print(json.dumps({"action": "block", "message": "⛔ blocked by yurucode guard - dangerous command"}))
            sys.exit(2)

    if tool in ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']:
        path = inp.get('file_path', '') or inp.get('notebook_path', '')
        if is_protected_path(path):
            print(json.dumps({"action": "block", "message": "⛔ blocked by yurucode guard - protected path"}))
            sys.exit(2)

    print('{"action":"continue"}')
except Exception as e:
    # SECURITY: Fail closed - block on any error
    print(json.dumps({"action": "block", "message": "⛔ yurucode guard error - operation blocked for safety"}))
    sys.exit(2)`
  }
];
