@echo off
echo Building yurucode for Windows...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

echo Killing any running processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Building frontend...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo Frontend build failed!
    pause
    exit /b 1
)

echo.
echo Building Tauri app for Windows...
call npx tauri build --target x86_64-pc-windows-msvc

echo.
echo Build complete! Check src-tauri\target\release for the executable
echo Installer will be in src-tauri\target\release\bundle\nsis
pause