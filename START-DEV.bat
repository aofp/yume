@echo off
echo Starting yurucode with console output...
echo.

cd /d "C:\Users\muuko\Desktop\yurucode"

echo Current directory: %CD%
echo.

REM Kill any existing Node processes on our ports
echo Killing any existing processes on ports 5173 and 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F 2>nul
timeout /t 1 /nobreak >nul

echo.
echo Starting Vite in VISIBLE window (keep it open!)...
start "Vite Dev Server - DO NOT CLOSE" cmd /k "npm run dev"

echo Waiting for Vite to start (10 seconds)...
timeout /t 10 /nobreak >nul

echo.
echo Checking if Vite is running...
netstat -ano | findstr :5173
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Vite is not running on port 5173!
    pause
    exit /b 1
)

echo.
echo Starting Tauri (without dev server)...
call npm run tauri:dev:manual

echo.
echo Exit code: %ERRORLEVEL%
echo.

REM Kill Vite when done
echo Stopping Vite...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /PID %%a /F 2>nul

echo Press any key to exit...
pause >nul