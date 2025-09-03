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
    name: 'AutoCompaction',
    icon: IconRefresh,
    description: 'Automatically compact at 97% context usage',
    script: `#!/usr/bin/env python3
import json
import sys

# AutoCompaction Hook
# This hook is called when context usage reaches certain thresholds
# The compactionService will automatically send /compact when enabled

try:
    input_data = json.load(sys.stdin)
    usage = input_data.get('data', {}).get('usage_percentage', 0)
    action_type = input_data.get('data', {}).get('action_type', '')
    
    # Log the compaction event
    if action_type == 'AutoTrigger' and usage >= 97:
        response = {
            "action": "continue",
            "message": f"🔄 Auto-compacting at {usage:.1f}% - /compact command will be sent automatically"
        }
        print(json.dumps(response))
    elif action_type == 'Force' and usage >= 98:
        response = {
            "action": "continue",
            "message": f"🚨 Force-compacting at {usage:.1f}% to prevent overflow"
        }
        print(json.dumps(response))
    else:
        print('{"action":"continue"}')
    sys.exit(0)
except Exception as e:
    # Always allow compaction to proceed
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