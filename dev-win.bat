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

REM Start Vite dev server and Tauri in parallel
echo Starting development servers...
call npx concurrently -k "npm run dev" "npx tauri dev --no-dev-server --config src-tauri/tauri.dev.conf.json"