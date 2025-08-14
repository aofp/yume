@echo off
echo Testing Vite startup...
echo.
echo Current directory: %CD%
echo.
echo Running: npm run dev
echo.
npm run dev
echo.
echo Exit code: %ERRORLEVEL%
pause