@echo off
setlocal enabledelayedexpansion

set "SRC_DIR=%~dp0"
set "DIST_DIR=%SRC_DIR%dist-package"

echo [INFO] Source: %SRC_DIR%
echo [INFO] Output: %DIST_DIR%

if exist "%DIST_DIR%" (
  echo [INFO] Removing existing dist-package...
  rmdir /s /q "%DIST_DIR%"
)

mkdir "%DIST_DIR%"
if errorlevel 1 (
  echo [ERROR] Failed to create dist-package.
  exit /b 1
)

set FILES=manifest.json service_worker.js settings.js content.js overlay.css popup.html popup.css popup.js options.html options.css options.js
set ICON_DIR=assets\icons
set ICON_FILES=icon-16.png icon-32.png icon-48.png icon-128.png icon-disabled-16.png icon-disabled-32.png icon-disabled-48.png icon-disabled-128.png

for %%F in (%FILES%) do (
  if not exist "%SRC_DIR%%%F" (
    echo [ERROR] Missing required file: %%F
    exit /b 1
  )
)

for %%F in (%ICON_FILES%) do (
  if not exist "%SRC_DIR%%ICON_DIR%\%%F" (
    echo [ERROR] Missing required icon: %ICON_DIR%\%%F
    exit /b 1
  )
)

for %%F in (%FILES%) do (
  copy /y "%SRC_DIR%%%F" "%DIST_DIR%\" >nul
  if errorlevel 1 (
    echo [ERROR] Failed to copy: %%F
    exit /b 1
  )
)

mkdir "%DIST_DIR%\%ICON_DIR%"
if errorlevel 1 (
  echo [ERROR] Failed to create: %ICON_DIR%
  exit /b 1
)

for %%F in (%ICON_FILES%) do (
  copy /y "%SRC_DIR%%ICON_DIR%\%%F" "%DIST_DIR%\%ICON_DIR%\" >nul
  if errorlevel 1 (
    echo [ERROR] Failed to copy icon: %ICON_DIR%\%%F
    exit /b 1
  )
)

echo [INFO] Package folder created successfully.
echo [INFO] Files:
dir /b "%DIST_DIR%"

endlocal
exit /b 0
