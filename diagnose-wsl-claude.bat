@echo off
echo === WSL Claude CLI Diagnostic ===
echo.

echo 1. Checking WSL user...
wsl -e bash -c "whoami"
echo.

echo 2. Checking home directory...
wsl -e bash -c "echo $HOME"
echo.

echo 3. Looking for Claude CLI installations...
echo    Checking /home/yuru/.claude/local/node_modules/.bin/claude...
wsl -e bash -c "ls -la /home/yuru/.claude/local/node_modules/.bin/claude 2>&1"
echo.

echo    Checking ~/.npm-global/bin/claude...
wsl -e bash -c "ls -la ~/.npm-global/bin/claude 2>&1"
echo.

echo    Checking with 'which claude'...
wsl -e bash -c "which claude 2>&1"
echo.

echo    Checking with 'whereis claude'...
wsl -e bash -c "whereis claude 2>&1"
echo.

echo 4. Searching for any claude binary in common locations...
wsl -e bash -c "find /home -name claude -type f 2>/dev/null | head -10"
echo.

echo 5. Checking if npx can find claude...
wsl -e bash -c "npx --no-install which claude 2>&1"
echo.

echo === Installation Instructions ===
echo If Claude CLI is not found, install it in WSL:
echo 1. Open WSL: wsl
echo 2. Install Claude CLI globally: npm install -g @anthropic-ai/claude-cli
echo    OR locally: cd ~ && npm install @anthropic-ai/claude-cli
echo 3. If installed locally, the path would be: ~/node_modules/.bin/claude
echo.

pause