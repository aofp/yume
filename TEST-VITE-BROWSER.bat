@echo off
echo Testing Vite in browser...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

REM Kill any existing Vite
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F 2>nul
timeout /t 1 /nobreak >nul

echo Starting Vite...
start "Vite" cmd /k "npm run dev"

echo.
echo Waiting 5 seconds for Vite to start...
timeout /t 5 /nobreak >nul

echo.
echo Opening http://localhost:5173 in your browser...
start http://localhost:5173

echo.
echo Check if the page loads in your browser.
echo If it works in browser but not in Tauri, we have a Tauri issue.
echo If it doesn't work in browser, we have a Vite issue.
echo.
pause