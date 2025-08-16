@echo off
echo Clearing Windows icon cache...
echo.

:: Method 1: Refresh icon cache
ie4uinit.exe -show

:: Method 2: Delete icon cache database
del /a /f "%localappdata%\IconCache.db" 2>nul
del /a /f "%localappdata%\Microsoft\Windows\Explorer\iconcache*" 2>nul

:: Method 3: Restart Explorer
echo Restarting Windows Explorer...
taskkill /f /im explorer.exe >nul 2>&1
timeout /t 2 /nobreak >nul
start explorer.exe

echo.
echo Icon cache cleared! 
echo The yurucode.exe icon should now display at full resolution.
echo.
echo If the icon is still blurry:
echo 1. Rebuild the app with: npm run tauri:build
echo 2. Make sure the new icon.ico is being used
echo.
pause