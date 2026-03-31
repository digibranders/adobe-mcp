@echo off
REM One-time installation of the Adobe MCP Photoshop UXP plugin.
REM After running this script, the plugin loads automatically whenever Photoshop starts.
REM
REM Usage: Double-click this file or run from Command Prompt.

setlocal enabledelayedexpansion

set "PLUGIN_ID=com.digibranders.adobe-desktop-mcp.photoshop"
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "PLUGIN_SRC=%PROJECT_ROOT%\plugins\photoshop-uxp"
set "UXP_PLUGINS_BASE=%APPDATA%\Adobe\UXP\PluginsStorage\PHSP"

if not exist "%PLUGIN_SRC%\manifest.json" (
    echo Error: Plugin source not found at %PLUGIN_SRC%
    pause
    exit /b 1
)

echo Adobe MCP Photoshop Plugin Installer
echo =====================================
echo.

REM Find target directory
set "TARGET_DIR=%UXP_PLUGINS_BASE%\Internal\%PLUGIN_ID%"

echo Source:  %PLUGIN_SRC%
echo Target:  %TARGET_DIR%
echo.

REM Remove previous installation
if exist "%TARGET_DIR%" (
    echo Removing previous installation...
    rmdir /s /q "%TARGET_DIR%"
)

REM Copy plugin files
mkdir "%TARGET_DIR%" 2>nul
copy /y "%PLUGIN_SRC%\manifest.json" "%TARGET_DIR%\" >nul
copy /y "%PLUGIN_SRC%\main.js" "%TARGET_DIR%\" >nul
copy /y "%PLUGIN_SRC%\index.html" "%TARGET_DIR%\" >nul
copy /y "%PLUGIN_SRC%\styles.css" "%TARGET_DIR%\" >nul

echo Plugin files copied.
echo.
echo Installation complete!
echo.
echo Next steps:
echo   1. Restart Photoshop (if it is currently running)
echo   2. Go to Plugins ^> Adobe MCP to open the panel
echo   3. The bridge will auto-connect to the MCP server
echo.
echo NOTE: If the plugin does not appear in Photoshop's Plugins menu,
echo you may need to load it once via UXP Developer Tool:
echo   1. Open UXP Developer Tool
echo   2. Click 'Add Plugin' and select: %PLUGIN_SRC%
echo   3. Click 'Load' to activate it in Photoshop
echo   4. After the first load, it will persist across restarts
echo.
pause
