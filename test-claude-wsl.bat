@echo off
echo Testing Claude detection in WSL...
echo ==================================
echo.

wsl.exe -e bash -c "chmod +x ./test-claude-wsl.sh && ./test-claude-wsl.sh"

echo.
pause