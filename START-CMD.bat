@echo off
:: Start yurucode in a command prompt window for debugging
:: This shows all console output from the app

echo Starting yurucode with console output...
echo.

:: Change to the script's directory
cd /d "%~dp0"

:: Start Tauri in development mode
call npm run tauri:dev

:: Keep window open if there's an error
if errorlevel 1 (
    echo.
    echo Error occurred. Press any key to exit...
    pause > nul
)