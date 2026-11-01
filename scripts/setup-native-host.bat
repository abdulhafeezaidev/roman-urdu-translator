@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo Roman Urdu Translator -- One-Time Native Host Setup
echo ================================================================
echo.

REM 1. Verify Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js v18 or later from https://nodejs.org/ before running this setup.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Node.js detected: %NODE_VERSION%

REM 2. Resolve Paths
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
pushd "%PROJECT_ROOT%"
set "PROJECT_ROOT_ABS=%CD%"
popd

set "HOST_JSON=%PROJECT_ROOT_ABS%\native-host\com.roman_urdu_translator.host.json"
set "LAUNCHER_BAT=%PROJECT_ROOT_ABS%\native-host\host-launcher.bat"

if not exist "%HOST_JSON%" (
    echo [ERROR] Native host manifest not found at: %HOST_JSON%
    pause
    exit /b 1
)

echo [OK] Native host manifest: %HOST_JSON%
echo [OK] Native host launcher: %LAUNCHER_BAT%

REM 3. Check / Configure .env
if not exist "%PROJECT_ROOT_ABS%\.env" (
    if exist "%PROJECT_ROOT_ABS%\.env.example" (
        echo [INFO] Creating .env from .env.example...
        copy "%PROJECT_ROOT_ABS%\.env.example" "%PROJECT_ROOT_ABS%\.env" >nul
        echo [WARNING] Please edit .env and set your GEMINI_API_KEY before translating.
    )
) else (
    echo [OK] Configuration file .env is present.
)

REM 4. Register in Windows Registry for Google Chrome
echo [INFO] Registering Native Messaging Host in Windows Registry...
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.roman_urdu_translator.host" /ve /t REG_SZ /d "%HOST_JSON%" /f >nul

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to write to Windows Registry.
    pause
    exit /b 1
)

echo.
echo ================================================================
echo SETUP COMPLETE!
echo.
echo Chrome Native Messaging Host is registered for your user profile.
echo.
echo NORMAL DAILY USAGE:
echo 1. Open Google Chrome.
echo 2. Navigate to any documentation webpage.
echo 3. Click the Roman Urdu Translator extension icon.
echo 4. Click "Translate Page".
echo.
echo The local translator backend will now start automatically in the
echo background whenever needed. You do NOT need to run any terminal command!
echo ================================================================
echo.
pause
