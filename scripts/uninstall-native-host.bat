@echo off
echo ================================================================
echo Roman Urdu Translator -- Uninstall Native Messaging Host
echo ================================================================
echo.

reg delete "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.roman_urdu_translator.host" /f >nul 2>nul

if %ERRORLEVEL% equ 0 (
    echo [OK] Native Messaging Host uninstalled from Windows Registry.
) else (
    echo [INFO] Native Messaging Host was not found in registry - already uninstalled.
)

echo.
pause
