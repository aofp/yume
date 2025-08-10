@echo off
title yurucode
cd /d C:\Users\muuko\Desktop\yurucode
node scripts/start-multi.js
echo Closing window...
timeout /t 2 /nobreak >nul
taskkill /FI "WINDOWTITLE eq yurucode" /F >nul 2>&1
exit