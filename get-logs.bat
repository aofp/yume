@echo off
echo Collecting yurucode logs...
echo.

:: Create logs directory
if not exist "logs" mkdir logs

:: Copy all yurucode logs from temp
echo Copying logs from %TEMP%...
copy "%TEMP%\yurucode*.log" logs\ >nul 2>nul
copy "%TEMP%\yurucode*.txt" logs\ >nul 2>nul

:: Check what we found
echo.
echo Found logs:
echo ----------
dir logs\yurucode* /b 2>nul

:: Display the logs
echo.
echo ========================================
echo RUST LOG:
echo ========================================
type "logs\yurucode-rust.log" 2>nul || echo [No rust log found]

echo.
echo ========================================
echo SERVER LOG:
echo ========================================
type "logs\yurucode-server.log" 2>nul || echo [No server log found]

echo.
echo ========================================
echo RUNNING STATUS:
echo ========================================
type "logs\yurucode-server-RUNNING.txt" 2>nul || echo [No running status found]

echo.
pause