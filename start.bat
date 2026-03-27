@echo off
title WA Porter - WhatsApp Media Automator
color 0A

echo.
echo  ========================================
echo   WA Porter - WhatsApp Media Automator
echo  ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed!
    echo.
    echo  Please download and install Node.js from:
    echo  https://nodejs.org/
    echo.
    echo  After installing, close and reopen this script.
    pause
    exit /b 1
)

echo  [OK] Node.js found:
node --version
echo.

:: Create .env if missing
if not exist "apps\backend\.env" (
    echo  [SETUP] Creating config file...
    copy apps\backend\.env.example apps\backend\.env >nul 2>nul
    if not exist "apps\backend\.env" (
        echo DATABASE_URL="file:./dev.db"> apps\backend\.env
        echo BACKEND_PORT=3003>> apps\backend\.env
        echo FRONTEND_URL="http://localhost:3002">> apps\backend\.env
        echo GEMINI_API_KEY="">> apps\backend\.env
    )
    echo.
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo  [SETUP] Installing dependencies... (first run, may take a minute^)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

:: Setup database if needed
if not exist "apps\backend\dev.db" (
    echo  [SETUP] Setting up database...
    cd apps\backend
    call npx prisma generate
    call npx prisma db push
    cd ..\..
    echo.
)

:: Build frontend if needed
if not exist "apps\frontend\out" (
    echo  [SETUP] Building interface... (first run only^)
    call npm run build:frontend
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to build frontend.
        pause
        exit /b 1
    )
    echo.
)

echo  ========================================
echo   Starting on http://localhost:3003
echo   Keep this window open!
echo  ========================================
echo.

:: Open browser after short delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3003"

:: Start the server
call npm run start
