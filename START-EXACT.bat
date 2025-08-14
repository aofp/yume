@echo off
echo Starting yurucode EXACTLY like working commit...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

REM Kill any node processes
taskkill /F /IM node.exe 2>nul >nul 2>&1

REM Just run tauri:dev - it will start Vite via beforeDevCommand
npm run tauri:dev

pause