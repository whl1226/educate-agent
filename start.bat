@echo off
pushd "%~dp0"

:: ============================================
::  CHECK: Node.js (requires v18 or later,
::  because the backend uses better-sqlite3
::  native module)
:: ============================================
node -v >nul 2>&1
if errorlevel 1 goto TRY_PATHS
for /f "tokens=2 delims=v." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% geq 18 goto NODE_OK
echo [INFO] Node.js v%NODE_MAJOR% found in PATH, but v18+ is required.
echo [INFO] Searching for a newer Node.js...

:TRY_PATHS
:: Scan WorkBuddy managed Node.js (any installed version)
set "WB_NODE="
for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%d\node.exe" set "WB_NODE=%%d"
)
if defined WB_NODE (
    call :try_node "%WB_NODE%"
    if not errorlevel 1 goto NODE_OK
)

:: Standard install locations
call :try_node "%ProgramFiles%\nodejs"
if not errorlevel 1 goto NODE_OK

call :try_node "%LOCALAPPDATA%\fnm\nodejs"
if not errorlevel 1 goto NODE_OK

call :try_node "%APPDATA%\nvm"
if not errorlevel 1 goto NODE_OK

:: Nothing usable found
node -v >nul 2>&1
if errorlevel 1 goto NODE_MISSING

:NODE_TOO_OLD
echo.
echo  =============================================
echo    ERROR: Node.js v18 or later is required
echo.
echo    Your current version:
node -v
echo.
echo    This app uses better-sqlite3 (native),
echo    which needs Node.js v18 or later.
echo.
echo    Please upgrade from: https://nodejs.org/
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:NODE_MISSING
echo.
echo  =============================================
echo    ERROR: Node.js is NOT installed or not
echo    found in PATH.
echo.
echo    This application requires Node.js v18+
echo    to run. Please install it first.
echo.
echo    Download from: https://nodejs.org/
echo    (version 18 or later required)
echo.
echo    After installation, restart your computer
echo    or add Node.js to your system PATH, then
echo    run this script again.
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:NODE_OK
echo [OK] Node.js
node -v
echo.

:: ============================================
::  CHECK: Root build deps (esbuild)
:: ============================================
if not exist "node_modules\esbuild\package.json" (
    if not exist "package.json" goto ROOT_PKG_MISSING
    goto INSTALL_ROOT_DEPS
)
goto DEPS_ROOT_OK

:ROOT_PKG_MISSING
echo.
echo  =============================================
echo    ERROR: package.json not found at project
echo    root. Cannot install build tools.
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:INSTALL_ROOT_DEPS
echo.
echo [....] Installing build tools (npm install at project root)...
echo.
call npm install
if errorlevel 1 goto INSTALL_FAILED
if not exist "node_modules\esbuild\package.json" goto INSTALL_FAILED

:DEPS_ROOT_OK
echo [OK] Build tools ready
echo.

:: ============================================
::  CHECK: Server deps (@nestjs/core)
:: ============================================
cd /d "%~dp0server"
if not exist "node_modules\@nestjs\core\package.json" goto INSTALL_SERVER_DEPS
goto DEPS_SERVER_OK

:INSTALL_SERVER_DEPS
echo.
echo [....] Installing server dependencies (npm install in server/)...
echo.
call npm install
if errorlevel 1 goto INSTALL_FAILED
if not exist "node_modules\@nestjs\core\package.json" goto INSTALL_FAILED

:DEPS_SERVER_OK
echo [OK] Server dependencies ready
echo.

:: ============================================
::  CHECK: server\.env (SIGNING_SECRET required
::  by the frontend build script)
:: ============================================
if not exist ".env" goto ENV_MISSING
echo [OK] .env found
echo.

:: ============================================
::  BUILD: backend (tsc -> dist/)
:: ============================================
echo [....] Building backend (npm run build)...
call npm run build
if errorlevel 1 goto BUILD_FAILED
if not exist "dist\main.js" goto BUILD_FAILED
echo [OK] Backend built
echo.

:: ============================================
::  BUILD: frontend (esbuild -> public/assets/app)
:: ============================================
cd /d "%~dp0"
echo [....] Building frontend (node build-frontend.mjs)...
node build-frontend.mjs
if errorlevel 1 goto BUILD_FAILED
echo [OK] Frontend built
echo.

:: ============================================
::  CLEANUP: Kill any process on port 3000
::  (exact port match only - ":3000 " not ":30000")
:: ============================================
for /f "tokens=5" %%a in ('netstat -ano ^| find "LISTENING" ^| findstr /C:":3000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
ping -n 2 127.0.0.1 >nul

:: ============================================
::  START: Server (background, logs to server\server.log)
::  cwd must be server/ (static root logic)
:: ============================================
cd /d "%~dp0server"
echo  Starting server...
start "XiangYa Server" /MIN cmd /c "node dist/main.js >> server.log 2>&1"

:: Wait for server to be ready (poll port 3000)
echo  Waiting for server to start...
set "TICKS=0"
:WAIT_LOOP
ping -n 2 127.0.0.1 >nul
set /a "TICKS+=1"
netstat -ano | find "LISTENING" | findstr /C:":3000 " >nul 2>&1
if errorlevel 1 (
    if %TICKS% lss 15 goto WAIT_LOOP
    goto START_FAILED
)

:: ============================================
::  OPEN: Browser with cache-busting timestamp
::  (avoids stale cached login.html)
:: ============================================
:OPEN_BROWSER
for /f "tokens=*" %%t in ('powershell -NoProfile -Command "[int][double]::Parse((Get-Date -UFormat %%s))"') do set "TS=%%t"
set "TS=%TS:~0,-1%"
echo  Opening http://localhost:3000/login.html?v=%TS%
start http://localhost:3000/login.html?v=%TS%

echo.
echo  ============================================
echo    Server is running
echo    http://localhost:3000
echo.
echo    Logs are written to: server\server.log
echo.
echo    Press any key to STOP the server
echo  ============================================
echo.
pause >nul

:: ============================================
::  STOP: Kill only this project's server
:: ============================================
for /f "tokens=5" %%a in ('netstat -ano ^| find "LISTENING" ^| findstr /C:":3000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo [OK] Server stopped.
ping -n 2 127.0.0.1 >nul
exit /b 0

:START_FAILED
echo.
echo  =============================================
echo    ERROR: Server failed to start
echo.
echo    Check server\server.log for details.
echo    Check if port 3000 is already in use.
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:INSTALL_FAILED
echo.
echo  =============================================
echo    ERROR: Dependency installation failed
echo.
echo    Possible reasons:
echo    - No internet connection
echo    - Network firewall blocking npm
echo    - Disk space full
echo.
echo    Try running manually:
echo      npm install            (project root)
echo      cd server ^&^& npm install
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:ENV_MISSING
echo.
echo  =============================================
echo    ERROR: server\.env not found
echo.
echo    This file holds SIGNING_SECRET / JWT
echo    secrets used by backend and the frontend
echo    build. Copy it from your dev machine or
echo    create it manually.
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:BUILD_FAILED
echo.
echo  =============================================
echo    ERROR: Build failed
echo.
echo    Try running manually:
echo      cd server ^&^& npm run build
echo      node build-frontend.mjs
echo.
echo    For frontend build errors, make sure
echo    server\.env contains SIGNING_SECRET.
echo  =============================================
echo.
echo Press any key to close...
pause >nul
exit /b 1

:: ============================================
::  SUBROUTINE: try_node
::  %1 = candidate folder containing node.exe
::  Returns errorlevel 0 and prepends PATH only
::  when node.exe exists AND version is v18+.
:: ============================================
:try_node
if not exist "%~1\node.exe" exit /b 1
"%~1\node.exe" -v >nul 2>&1
if errorlevel 1 exit /b 1
for /f "tokens=2 delims=v." %%v in ('"%~1\node.exe" -v') do set "TRY_MAJOR=%%v"
if %TRY_MAJOR% lss 18 exit /b 1
set "PATH=%~1;%PATH%"
exit /b 0
