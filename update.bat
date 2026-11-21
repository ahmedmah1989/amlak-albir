@echo off
cd /d "%~dp0"
echo Rebuilding after replacing code files (data and backups folders are kept)...
if exist ".next" rmdir /s /q ".next"
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call npm run build
if errorlevel 1 goto fail
echo Done. Run start.bat
pause
goto end
:fail
echo Something failed. Take a screenshot and send it.
pause
:end
