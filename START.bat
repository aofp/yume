@echo off
echo ===============================================
echo     yume - Multi-Instance Development
echo ===============================================
echo.

cd /d "%~dp0"

REM Allocate ports BEFORE starting Tauri
echo Allocating dynamic ports for this instance...
node scripts/allocate-port.mjs

echo.
echo Starting Tauri with allocated ports...
echo.

REM Now run tauri:dev which will use the allocated ports
call npm run tauri:dev

pause