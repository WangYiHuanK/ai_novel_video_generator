@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   AI Novel Video Generator - Build
echo ============================================
echo.

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" build.py
) else (
    python build.py
)

echo.
pause
