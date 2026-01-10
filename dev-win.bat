@echo off
echo ===============================================
echo     yurucode - Windows Development Mode
echo ===============================================
echo.

REM Clean up any existing port files
if exist .vite-port del .vite-port
if exist .server-port del .server-port

REM Run the port allocation script
echo Allocating dynamic ports...
call node scripts/allocate-port.mjs

REM Start Tauri dev with concurrently (Vite + Tauri)
echo Starting development server...
call npm run tauri:dev:win