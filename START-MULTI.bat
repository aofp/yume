@echo off
echo ===============================================
echo     yurucode - Multi-Instance Support
echo ===============================================
echo.

cd /d "%~dp0"

REM Generate unique instance ID
for /f %%i in ('powershell -command "[guid]::NewGuid().ToString().Substring(0,8)"') do set INSTANCE_ID=%%i

echo Instance ID: %INSTANCE_ID%

REM Create instance-specific port files
set INSTANCE_DIR=%TEMP%\yurucode-%INSTANCE_ID%
mkdir "%INSTANCE_DIR%" 2>nul

REM Allocate ports for this specific instance
echo Allocating ports for instance %INSTANCE_ID%...

REM Find available ports using netstat
set /a VITE_PORT=60000 + %RANDOM% %% 1000
set /a SERVER_PORT=60000 + %RANDOM% %% 1000

:check_vite
netstat -an | findstr :%VITE_PORT% >nul
if %errorlevel%==0 (
    set /a VITE_PORT+=1
    if %VITE_PORT% gtr 61000 set VITE_PORT=60000
    goto check_vite
)

:check_server
netstat -an | findstr :%SERVER_PORT% >nul
if %errorlevel%==0 (
    set /a SERVER_PORT+=1
    if %SERVER_PORT% gtr 61000 set SERVER_PORT=60001
    goto check_server
)

echo Ports allocated:
echo   Vite:   %VITE_PORT%
echo   Server: %SERVER_PORT%

REM Write instance-specific port files
echo %VITE_PORT% > "%INSTANCE_DIR%\.vite-port"
echo %SERVER_PORT% > "%INSTANCE_DIR%\.server-port"

REM Create instance-specific Tauri config
copy /y "src-tauri\tauri.conf.json" "%INSTANCE_DIR%\tauri.conf.json" >nul
powershell -Command "(Get-Content '%INSTANCE_DIR%\tauri.conf.json') -replace '\"devUrl\": \"http://localhost:\d+\"', '\"devUrl\": \"http://localhost:%VITE_PORT%\"' | Set-Content '%INSTANCE_DIR%\tauri.conf.json'"

REM Set environment variables for this instance
set TAURI_CONFIG=%INSTANCE_DIR%\tauri.conf.json
set VITE_PORT_FILE=%INSTANCE_DIR%\.vite-port
set SERVER_PORT_FILE=%INSTANCE_DIR%\.server-port
set PORT=%SERVER_PORT%

echo.
echo Starting instance %INSTANCE_ID%...
echo.

REM Start with instance-specific config
tauri dev --config %INSTANCE_DIR%\tauri.conf.json

REM Cleanup on exit
rmdir /s /q "%INSTANCE_DIR%" 2>nul

pause