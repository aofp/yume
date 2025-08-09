@echo off
echo Building yurucode for Windows...
echo.

echo [1/3] Cleaning old builds...
if exist release rmdir /s /q release
if exist dist rmdir /s /q dist
if exist dist-app rmdir /s /q dist-app
if exist dist-electron rmdir /s /q dist-electron
if exist release-final rmdir /s /q release-final
if exist out rmdir /s /q out

echo.
echo [2/3] Building React app...
call npm run build

echo.
echo [3/3] Building Windows installer...
call npx electron-builder --win

echo.
echo Build complete! 
echo Installer: release\yurucode-setup-1.0.0.exe
echo Unpacked: release\win-unpacked\yurucode.exe
pause