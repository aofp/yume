#!/bin/bash
# Patch the markdown bundle to fix require_core error
echo "Patching markdown bundle..."
cd /Users/yuru/yurucode
sed -i '' 's/require_core().Object.assign/Object.assign/g' dist/assets/markdown-CK_bGesl.js
echo "Patch complete!"