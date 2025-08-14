@echo off
echo Starting yurucode with Vite 7...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

echo Killing all Node processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Starting Tauri (will start Vite automatically)...
npm run tauri:dev

pause