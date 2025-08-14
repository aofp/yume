@echo off
echo ===============================================
echo     yurucode - True Multi-Instance
echo ===============================================
echo.

cd /d "%~dp0"

REM Don't use any shared files or configs
REM Just let each component find its own port

REM Reset tauri.conf.json to default
powershell -Command "(Get-Content 'src-tauri\tauri.conf.json') -replace '\"devUrl\": \"http://localhost:\d+\"', '\"devUrl\": \"http://localhost:5173\"' | Set-Content 'src-tauri\tauri.conf.json'"

REM Delete any port files
del .vite-port 2>nul
del .server-port 2>nul

REM Just run tauri:dev - let Vite and server find their own ports
echo Starting independent instance...
echo Each component will find its own available port.
echo.

npm run tauri:dev

pause