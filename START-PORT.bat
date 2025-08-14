@echo off
echo ===============================================
echo     yurucode - Simple Dynamic Ports
echo ===============================================
echo.

cd /d "%~dp0"

REM Use fixed but uncommon ports
set VITE_PORT=60123
set SERVER_PORT=60456

echo Using ports:
echo   Vite:   %VITE_PORT%
echo   Server: %SERVER_PORT%

REM Write to files
echo %VITE_PORT% > .vite-port
echo %SERVER_PORT% > .server-port

REM Update Tauri config
powershell -Command "(Get-Content 'src-tauri\tauri.conf.json') -replace '\"devUrl\": \"http://localhost:\d+\"', '\"devUrl\": \"http://localhost:%VITE_PORT%\"' | Set-Content 'src-tauri\tauri.conf.json'"

REM Set environment variable for server
set PORT=%SERVER_PORT%

echo.
echo Starting development server...
npm run tauri:dev

pause