@echo off
echo ===============================================
echo       Starting yurucode with Dynamic Ports
echo ===============================================
echo.

cd /d "%~dp0"

REM First, run the dynamic port setup
echo Setting up dynamic ports...
call node scripts/start-dynamic-dev.mjs

REM The above script handles everything
REM If it fails, we'll get an error code
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to start yurucode!
    pause
    exit /b %ERRORLEVEL%
)