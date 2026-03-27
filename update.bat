@echo off
title WA Porter - Updater
color 0B

echo.
echo  ========================================
echo   WA Porter - Updating...
echo  ========================================
echo.

:: Check git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Git is not installed!
    echo  Download from: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: Pull latest changes
echo  [1/4] Pulling latest changes...
git pull
if %errorlevel% neq 0 (
    echo  [ERROR] Failed to pull updates. Check your internet.
    pause
    exit /b 1
)

:: Install any new dependencies
echo  [2/4] Updating dependencies...
call npm install

:: Update database schema
echo  [3/4] Updating database...
cd apps\backend
call npx prisma generate
call npx prisma db push --accept-data-loss
cd ..\..

:: Rebuild frontend
echo  [4/4] Rebuilding interface...
call npm run build:frontend

echo.
echo  ========================================
echo   Update complete! Run start.bat to launch.
echo  ========================================
echo.
pause
