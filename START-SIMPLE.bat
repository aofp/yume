@echo off
echo Starting yurucode (matching working commit setup)...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

REM Kill existing processes
taskkill /F /IM node.exe 2>nul
timeout /t 1 /nobreak >nul

REM Start Vite in background (simple, no extra flags)
echo Starting Vite...
start /b cmd /c "npm run dev > nul 2>&1"

REM Wait for Vite
echo Waiting for Vite to start...
timeout /t 5 /nobreak >nul

REM Start Tauri
echo Starting Tauri...
call npm run tauri:dev

pause