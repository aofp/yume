@echo off
echo Building yurucode for Windows...
echo.

:: Kill any existing processes
taskkill /F /IM node.exe >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: Build frontend
echo [1/3] Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)

:: Prepare Tauri resources
echo [2/3] Preparing resources...
if not exist "src-tauri\resources" mkdir "src-tauri\resources"
copy /Y "dist-win\yurucode\server-simple.cjs" "src-tauri\resources\server-simple.cjs" >nul 2>nul
if not exist "src-tauri\resources\server-simple.cjs" (
    copy "server-claude-direct.cjs" "src-tauri\resources\server-simple.cjs" >nul
)

:: Ensure dependencies are in resources
if not exist "src-tauri\resources\node_modules" (
    cd src-tauri\resources
    call npm init -y >nul 2>nul
    call npm install express cors socket.io --production >nul 2>nul
    cd ..\..
)

:: Build Tauri app
echo [3/3] Building executable (this may take a few minutes)...
call npm run tauri:build:win

:: Check result - Now it should be yurucode.exe!
if exist "src-tauri\target\x86_64-pc-windows-msvc\release\yurucode.exe" (
    echo.
    echo ========================================
    echo BUILD SUCCESS!
    echo ========================================
    echo.
    echo Executable: src-tauri\target\x86_64-pc-windows-msvc\release\yurucode.exe
    echo.
    echo The exe will:
    echo - Auto-start Node.js server
    echo - Open in native window  
    echo - Close properly when you exit
    echo.
    echo Run it now? (Y/N)
    choice /c YN /n
    if %errorlevel%==1 (
        start src-tauri\target\x86_64-pc-windows-msvc\release\yurucode.exe
    )
) else if exist "src-tauri\target\release\yurucode.exe" (
    echo.
    echo ========================================
    echo BUILD SUCCESS!
    echo ========================================
    echo.
    echo Executable: src-tauri\target\release\yurucode.exe
    echo.
    echo Run it now? (Y/N)
    choice /c YN /n
    if %errorlevel%==1 (
        start src-tauri\target\release\yurucode.exe
    )
) else (
    echo.
    echo ERROR: Build failed - exe not found
    echo Run this from Windows Command Prompt, not WSL
)

pause