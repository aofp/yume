@echo off
echo Checking if Vite process is running...
echo.

tasklist | findstr node.exe

echo.
echo Checking what's on port 5173...
netstat -ano | findstr :5173

echo.
echo If you see a PID above, Vite is running.
echo If not, Vite crashed after serving the HTML.
pause