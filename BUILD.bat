@echo off
echo ========================================
echo Building yurucode for Windows...
echo ========================================
echo.

REM Clean previous build
echo Cleaning previous build...
if exist "src-tauri\target\release\yurucode.exe" (
    del "src-tauri\target\release\yurucode.exe"
)

REM Build the frontend and Tauri app
call npm run tauri:build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo BUILD SUCCESS!
echo ========================================
echo.
echo Executable: src-tauri\target\release\yurucode.exe
echo.
echo Installers created:
echo - MSI: src-tauri\target\release\bundle\msi\yurucode_1.0.0_x64_en-US.msi
echo - NSIS: src-tauri\target\release\bundle\nsis\yurucode_1.0.0_x64-setup.exe
echo.
echo The exe will:
echo - Auto-start Node.js server  
echo - Open in native window
echo - Close properly when you exit
echo.