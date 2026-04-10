@echo off
chcp 65001 >nul
echo Starting installation...
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
