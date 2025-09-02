import { IconShield, IconRefresh, IconBan } from '@tabler/icons-react';

export const YURUCODE_HOOKS = [
  {
    id: 'pre_tool_use',
    name: 'Tool Shield',
    icon: IconShield,
    description: 'block dangerous operations before execution',
    script: `#!/bin/bash
# Block dangerous commands
input=$(cat)
tool=$(echo "$input" | jq -r '.data.tool')
if [ "$tool" = "Bash" ]; then
  command=$(echo "$input" | jq -r '.data.input.command')
  if echo "$command" | grep -qE "(rm -rf|dd if=|mkfs)"; then
    echo '{"action":"block","message":"Dangerous command blocked"}'
    exit 2
  fi
fi
echo '{"action":"continue"}'`
  },
  {
    id: 'compaction_trigger',
    name: 'Smart Compaction',
    icon: IconRefresh,
    description: 'auto-compact at 96% context usage',
    script: `#!/usr/bin/env python3
import json
import sys

try:
    input_data = json.load(sys.stdin)
    usage = input_data.get('data', {}).get('usage_percentage', 0)
    action_type = input_data.get('data', {}).get('action_type', '')
    
    if action_type == 'AutoTrigger' and usage >= 96:
        response = {
            "action": "continue",
            "message": f"🔄 Auto-compacting at {usage}%"
        }
        print(json.dumps(response))
    else:
        print('{"action":"continue"}')
    sys.exit(0)
except:
    print('{"action":"continue"}')
    sys.exit(0)`
  },
  {
    id: 'discussion_enforcer',
    name: 'Discussion Enforcer',
    icon: IconBan,
    description: 'require discussion before code changes',
    script: `#!/usr/bin/env python3
import json
import sys

try:
    input_data = json.load(sys.stdin)
    tool = input_data.get('data', {}).get('tool', '')
    
    if tool in ['Write', 'Edit', 'MultiEdit']:
        response = {
            "action": "block",
            "message": "Discuss changes before implementing"
        }
        print(json.dumps(response))
        sys.exit(2)
    
    print('{"action":"continue"}')
    sys.exit(0)
except:
    print('{"action":"continue"}')
    sys.exit(0)`
  }
];