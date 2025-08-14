@echo off
echo Checking server logs location...
echo.

echo Log file should be at:
echo %LOCALAPPDATA%\yurucode\logs\server.log
echo.

if exist "%LOCALAPPDATA%\yurucode\logs\server.log" (
    echo Log file exists!
    echo.
    echo Contents:
    type "%LOCALAPPDATA%\yurucode\logs\server.log"
) else (
    echo Log file does NOT exist.
    echo.
    echo Creating directory and empty log file...
    mkdir "%LOCALAPPDATA%\yurucode\logs" 2>nul
    echo === yurucode server log === > "%LOCALAPPDATA%\yurucode\logs\server.log"
    echo No server output captured yet. The embedded server on Windows doesn't write logs currently. >> "%LOCALAPPDATA%\yurucode\logs\server.log"
)

echo.
pause