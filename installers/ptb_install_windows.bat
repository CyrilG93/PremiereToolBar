@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM // Resolve the project root whether the script is launched from the repo root or the installers folder.
set "PTB_SCRIPT_DIR=%~dp0"
for %%I in ("%PTB_SCRIPT_DIR%..") do set "PTB_ROOT=%%~fI"
set "PTB_MANIFEST=%PTB_ROOT%\manifest.json"

REM // Keep user-launched installer windows readable while allowing automation to opt out.
set "PTB_PACKAGE_ONLY=0"
set "PTB_PAUSE_ON_EXIT=1"

REM // Parse installer options after preserving the script path because SHIFT can affect argument references.
:PTB_PARSE_ARGS
if "%~1"=="" goto PTB_ARGS_DONE
if /I "%~1"=="--package-only" (
  set "PTB_PACKAGE_ONLY=1"
  set "PTB_PAUSE_ON_EXIT=0"
)
if /I "%~1"=="/package-only" (
  set "PTB_PACKAGE_ONLY=1"
  set "PTB_PAUSE_ON_EXIT=0"
)
if /I "%~1"=="--no-pause" set "PTB_PAUSE_ON_EXIT=0"
if /I "%~1"=="/no-pause" set "PTB_PAUSE_ON_EXIT=0"
shift
goto PTB_PARSE_ARGS
:PTB_ARGS_DONE

REM // PowerShell is included with supported Windows versions and is used for JSON parsing and ZIP packaging.
where powershell >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found. Tool Bar cannot build the CCX installer.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

REM // Read the plugin version from manifest.json.
for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw '%PTB_MANIFEST%' | ConvertFrom-Json).version"`) do set "PTB_VERSION=%%V"
if "%PTB_VERSION%"=="" (
  echo Unable to read Tool Bar version from manifest.json.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

REM // Stage only the files required by the UXP plugin runtime.
set "PTB_BUILD_DIR=%PTB_ROOT%\.ptb-installer-build"
set "PTB_STAGE_DIR=%PTB_BUILD_DIR%\package-%PTB_VERSION%-%RANDOM%"
set "PTB_CCX=%PTB_BUILD_DIR%\ToolBar-%PTB_VERSION%.ccx"
mkdir "%PTB_BUILD_DIR%" >nul 2>nul
mkdir "%PTB_STAGE_DIR%" >nul 2>nul
copy /Y "%PTB_ROOT%\manifest.json" "%PTB_STAGE_DIR%\manifest.json" >nul
copy /Y "%PTB_ROOT%\index.html" "%PTB_STAGE_DIR%\index.html" >nul
copy /Y "%PTB_ROOT%\index.js" "%PTB_STAGE_DIR%\index.js" >nul
copy /Y "%PTB_ROOT%\styles.css" "%PTB_STAGE_DIR%\styles.css" >nul
xcopy "%PTB_ROOT%\src" "%PTB_STAGE_DIR%\src" /E /I /Y >nul
if exist "%PTB_ROOT%\assets" xcopy "%PTB_ROOT%\assets" "%PTB_STAGE_DIR%\assets" /E /I /Y >nul

REM // Build a .ccx package; Adobe documents CCX as a ZIP container for UXP plugins.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%PTB_STAGE_DIR%\*' -DestinationPath '%PTB_CCX%' -Force"
if errorlevel 1 (
  echo Unable to package Tool Bar.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

echo Created %PTB_CCX%

REM // Allow release/package workflows to create the CCX without installing it immediately.
if "%PTB_PACKAGE_ONLY%"=="1" (
  set "PTB_EXIT_CODE=0"
  goto PTB_FINISH
)

REM // Find Adobe's Unified Plugin Installer Agent in the standard Creative Cloud locations.
set "PTB_UPIA="
if exist "%ProgramFiles%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" (
  set "PTB_UPIA=%ProgramFiles%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
)
if "%PTB_UPIA%"=="" if exist "%ProgramFiles(x86)%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" (
  set "PTB_UPIA=%ProgramFiles(x86)%\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"
)

REM // If UPIA is unavailable, keep the generated CCX and tell the user the supported manual method.
if "%PTB_UPIA%"=="" (
  echo Adobe UPIA was not found.
  echo Install manually by double-clicking: %PTB_CCX%
  echo You can also package/load the folder with the UXP Developer Tool.
  set "PTB_EXIT_CODE=2"
  goto PTB_FINISH
)

REM // Install the packaged UXP plugin through Adobe UPIA.
"%PTB_UPIA%" /install "%PTB_CCX%"
if errorlevel 1 (
  echo Adobe UPIA returned an installation error.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

echo Tool Bar %PTB_VERSION% installation command completed.
set "PTB_EXIT_CODE=0"

REM // Pause only for normal user runs so double-clicked errors stay visible.
:PTB_FINISH
if "%PTB_PAUSE_ON_EXIT%"=="1" (
  echo.
  pause
)
exit /b %PTB_EXIT_CODE%
