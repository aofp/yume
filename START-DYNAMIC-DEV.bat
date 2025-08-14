@echo off
echo ===============================================
echo     yurucode - Dynamic Port Development
echo ===============================================
echo.

cd /d "%~dp0"

echo Starting Tauri development with dynamic ports...
echo.
echo Vite will automatically find an available port
echo and update the Tauri configuration.
echo.

REM Just run the normal tauri:dev - Vite config will handle port allocation
call npm run tauri:dev

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Development server stopped.
    pause
)