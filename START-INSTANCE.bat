@echo off
echo ===============================================
echo     yurucode - Independent Instance
echo ===============================================
echo.

cd /d "%~dp0"

REM Each instance gets completely random ports
REM No shared files, no conflicts

REM Generate random ports using PowerShell
for /f %%i in ('powershell -command "Get-Random -Min 60000 -Max 61000"') do set VITE_PORT=%%i
for /f %%i in ('powershell -command "Get-Random -Min 60000 -Max 61000"') do set SERVER_PORT=%%i

echo This instance will use:
echo   Vite port:   %VITE_PORT%
echo   Server port: %SERVER_PORT%
echo.

REM Set environment variables
set PORT=%SERVER_PORT%

REM DON'T write to shared files
REM DON'T update shared config

REM Start Tauri directly with environment variables
echo Starting independent instance...
npm run tauri:dev

pause