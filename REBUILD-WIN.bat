@echo off
echo Rebuilding yurucode for Windows...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

echo Killing any running processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM yurucode.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Cleaning previous build...
rmdir /S /Q src-tauri\target\release\bundle 2>nul
del src-tauri\target\release\yurucode.exe 2>nul

echo.
echo Building frontend...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo Frontend build failed!
    pause
    exit /b 1
)

echo.
echo Building Tauri app for Windows x64...
call npx tauri build --target x86_64-pc-windows-msvc

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Build successful!
    echo.
    echo Executable: src-tauri\target\release\yurucode.exe
    echo Installer:  src-tauri\target\release\bundle\nsis\yurucode_*.exe
    echo ========================================
) else (
    echo.
    echo Build failed!
)

pause