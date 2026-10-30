@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul
if errorlevel 1 (
  echo Bun was not found on PATH. Install it from https://bun.sh
  pause
  exit /b 1
)
bun run app
if errorlevel 1 pause
endlocal
