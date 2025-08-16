@echo off
echo Installing Claude CLI in WSL...
echo.
echo This script will install Claude CLI in your WSL environment.
echo.
wsl -e bash -c "npm install -g @anthropic-ai/claude-cli"
echo.
echo Installation complete! 
echo Please restart yurucode to use Claude CLI.
pause