@echo off
title Amlak - Albir Alqunfudhah
cd /d "%~dp0"
if not exist logs mkdir logs

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist "node_modules\.bin\next.cmd" goto install
goto checkbuild

:install
echo [1/2] Installing packages (first time only, needs internet)...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

:checkbuild
if exist ".next\BUILD_ID" goto run
echo [2/2] Building the app...
call npm run build > logs\build.log 2>&1
if errorlevel 1 goto failbuild

:run
echo.
echo ============================================================
echo  Amlak is running.  This PC: http://localhost:3000
echo  Other devices: http://YOUR-PC-IP:3000  (find IP with: ipconfig)
echo  Server log: logs\server.log
echo  Keep this window open.
echo ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "npm start 2>&1 | Tee-Object -FilePath 'logs\server.log'"
goto end

:nonode
echo Node.js is not installed. Install the LTS version from https://nodejs.org then run this file again.
pause
goto end

:failbuild
type logs\build.log
echo.
echo Build failed. Send the file logs\build.log
pause
goto end

:fail
echo.
echo Something failed. Take a screenshot of this window and send it.
pause

:end
