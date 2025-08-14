@echo off
echo Debugging Vite connection...
echo.

REM Check if Vite is running
echo Checking port 5173...
netstat -ano | findstr :5173

echo.
echo Testing Vite with curl...
curl -I http://localhost:5173/

echo.
echo Testing specific resource...
curl http://localhost:5173/src/renderer/main.tsx

echo.
pause