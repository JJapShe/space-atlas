@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-space-atlas.ps1" %*
set "atlasExit=%ERRORLEVEL%"
if not "%atlasExit%"=="0" if "%~1"=="" pause
exit /b %atlasExit%
