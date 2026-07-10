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

REM // Read the plugin version from manifest.json, or infer it from the release CCX when the full source is absent.
if exist "%PTB_MANIFEST%" (
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content -Raw '%PTB_MANIFEST%' | ConvertFrom-Json).version"`) do set "PTB_VERSION=%%V"
) else (
  for /f "usebackq delims=" %%V in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$file = Get-ChildItem -LiteralPath '%PTB_ROOT%' -Filter 'ToolBar-*.ccx' -File | Sort-Object Name | Select-Object -Last 1; if ($file) { $file.BaseName -replace '^ToolBar-', '' }"`) do set "PTB_VERSION=%%V"
)
if "%PTB_VERSION%"=="" (
  echo Unable to read Tool Bar version from manifest.json or a ToolBar-*.ccx release file.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

REM // Preserve existing user buttons when the backup helper is present in a source checkout.
if exist "%PTB_ROOT%\scripts\ptb-backup-windows.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PTB_ROOT%\scripts\ptb-backup-windows.ps1" -Mode backup -Version "%PTB_VERSION%"
) else (
  echo Backup helper not found in this release folder; continuing with the included CCX installer.
)

REM // Use the release CCX when it is already included beside the README.
set "PTB_BUILD_DIR=%PTB_ROOT%\.ptb-installer-build"
set "PTB_STAGE_DIR=%PTB_BUILD_DIR%\package-%PTB_VERSION%"
set "PTB_RELEASE_CCX=%PTB_ROOT%\ToolBar-%PTB_VERSION%.ccx"
set "PTB_ZIP=%PTB_BUILD_DIR%\ToolBar-%PTB_VERSION%.zip"
set "PTB_UPIA_LOG=%PTB_BUILD_DIR%\upia-install-%PTB_VERSION%-%RANDOM%.log"
mkdir "%PTB_BUILD_DIR%" >nul 2>nul
if exist "%PTB_RELEASE_CCX%" (
  set "PTB_CCX=%PTB_RELEASE_CCX%"
  echo Using included release package: %PTB_RELEASE_CCX%
  goto PTB_PACKAGE_READY
)
set "PTB_CCX=%PTB_BUILD_DIR%\ToolBar-%PTB_VERSION%.ccx"

REM // Stage only the files required by the UXP plugin runtime when running from a source checkout.
REM // Reuse one staging folder and clean old package folders inside the build directory only.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$build=(Resolve-Path -LiteralPath '%PTB_BUILD_DIR%').Path; Get-ChildItem -LiteralPath $build -Directory -Filter 'package-*' | ForEach-Object { $resolved=$_.FullName; if ($resolved.StartsWith($build, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force } else { throw 'Unsafe Tool Bar staging path.' } }"
if errorlevel 1 (
  echo Unable to prepare the Tool Bar staging folder.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)
mkdir "%PTB_STAGE_DIR%" >nul 2>nul
copy /Y "%PTB_ROOT%\manifest.json" "%PTB_STAGE_DIR%\manifest.json" >nul
copy /Y "%PTB_ROOT%\index.html" "%PTB_STAGE_DIR%\index.html" >nul
copy /Y "%PTB_ROOT%\index.js" "%PTB_STAGE_DIR%\index.js" >nul
copy /Y "%PTB_ROOT%\styles.css" "%PTB_STAGE_DIR%\styles.css" >nul
xcopy "%PTB_ROOT%\src" "%PTB_STAGE_DIR%\src" /E /I /Y >nul
if exist "%PTB_ROOT%\assets" xcopy "%PTB_ROOT%\assets" "%PTB_STAGE_DIR%\assets" /E /I /Y >nul

REM // Build a ZIP first because some PowerShell versions only allow .zip output extensions.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%PTB_STAGE_DIR%\*' -DestinationPath '%PTB_ZIP%' -Force"
if errorlevel 1 (
  echo Unable to package Tool Bar.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

REM // Rename the ZIP container to .ccx, which Adobe uses for UXP plugin installation packages.
move /Y "%PTB_ZIP%" "%PTB_CCX%" >nul
if errorlevel 1 (
  echo Unable to create the Tool Bar CCX file.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

:PTB_PACKAGE_READY
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
if not "%PTB_UPIA_OVERRIDE%"=="" if exist "%PTB_UPIA_OVERRIDE%" (
  set "PTB_UPIA=%PTB_UPIA_OVERRIDE%"
)

REM // If UPIA is unavailable, keep the generated CCX and tell the user the supported manual method.
if "%PTB_UPIA%"=="" (
  echo Adobe UPIA was not found.
  echo CCX file ready here: %PTB_CCX%
  echo Double-clicking the CCX still requires Adobe Creative Cloud Desktop.
  echo For development loading, add this manifest in UXP Developer Tool: %PTB_MANIFEST%
  set "PTB_EXIT_CODE=2"
  goto PTB_FINISH
)

REM // Install through Adobe UPIA and inspect its output because some failures still return exit code 0.
"%PTB_UPIA%" /install "%PTB_CCX%" > "%PTB_UPIA_LOG%" 2>&1
set "PTB_UPIA_EXIT=%ERRORLEVEL%"
type "%PTB_UPIA_LOG%"
REM // Put the user backup mirror back where Tool Bar can restore it if UPIA cleared localStorage.
if exist "%PTB_ROOT%\scripts\ptb-backup-windows.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PTB_ROOT%\scripts\ptb-backup-windows.ps1" -Mode restore -Version "%PTB_VERSION%"
)
if not "%PTB_UPIA_EXIT%"=="0" (
  echo Adobe UPIA returned an installation error.
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)
findstr /I /C:"Failed to install" "%PTB_UPIA_LOG%" >nul
if not errorlevel 1 (
  echo Adobe UPIA reported that Tool Bar was not installed.
  echo CCX file ready here: %PTB_CCX%
  echo Double-clicking the CCX still uses Adobe Creative Cloud Desktop and may close immediately if Creative Cloud cannot install it.
  echo For development loading, add this manifest in UXP Developer Tool: %PTB_MANIFEST%
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)
findstr /I /C:"status = -" "%PTB_UPIA_LOG%" >nul
if not errorlevel 1 (
  echo Adobe UPIA reported that Tool Bar was not installed.
  echo CCX file ready here: %PTB_CCX%
  echo Double-clicking the CCX still uses Adobe Creative Cloud Desktop and may close immediately if Creative Cloud cannot install it.
  echo For development loading, add this manifest in UXP Developer Tool: %PTB_MANIFEST%
  set "PTB_EXIT_CODE=1"
  goto PTB_FINISH
)

echo Tool Bar %PTB_VERSION% installed successfully.
set "PTB_EXIT_CODE=0"

REM // Pause only for normal user runs so double-clicked errors stay visible.
:PTB_FINISH
if "%PTB_PAUSE_ON_EXIT%"=="1" (
  echo.
  pause
)
exit /b %PTB_EXIT_CODE%
